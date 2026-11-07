"""Export genuine submission-v2 evidence using the user-authorized openpyxl writer.

No model calls. Reads the existing JS export adapter's data, retains exact message
text, preserves source records, caches auditable summary formulas, and verifies
the final workbook after saving. Uses the Anaconda Python with openpyxl/Pillow.
"""
import argparse
import collections
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import statistics
import textwrap
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

import openpyxl
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.properties import CalcProperties
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
INK, LIGHT, GOLD, MUTED = "233F5A", "EEF3F7", "B38D60", "546A7B"
GREEN, RED, AMBER = "E8F1EA", "FAE9E7", "FFF3D9"
FONT = "PingFang SC"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
ET.register_namespace("", NS)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def display_width(text):
    return sum(0 if unicodedata.combining(c) else 2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in str(text))


def wrap_lines(text, width):
    lines = []
    for original in str("" if text is None else text).split("\n"):
        current, size = "", 0
        for c in original:
            step = display_width(c)
            if current and size + step > width:
                lines.append(current)
                current, size = "", 0
            current += c
            size += step
        lines.append(current)
    return lines or [""]


def compact_client(value):
    c = json.loads(value)
    selection = c["currentSelection"]
    interests = []
    for item in c.get("interests", []):
        interests.append(" / ".join(str(x) for x in item.values()))
    result = [
        f"客户：{c['name']} · {c['id']}（完全虚构）",
        f"顾问：{c['assignedAdvisor']}；生日月：{c.get('birthMonth', '未记录')}",
        "历史兴趣：" + ("；".join(interests) or "未记录"),
        "近期偏好：" + ((c.get("latestPreference") or {}).get("text") or "未记录"),
        "当前选择：" + " / ".join(str(selection[k] or "未选") for k in ["motif", "line", "sku"]),
        "购买场合：" + ({"personal": "自用", "wedding": "婚礼", "gift": "送礼"}.get(selection.get("purchaseOccasion"), "未选 / 不适用")),
    ]
    for label, key in [("选定购买", "purchaseId")]:
        if selection.get(key):
            result.append(label + "：" + selection[key])
    result.append("附加沟通背景：" + (c.get("additionalCommunicationContext") or "无"))
    for label, key in [("价格顾虑", "concern"), ("重新联系原因", "reconnectReason"), ("祝福类型", "greetingKind"), ("节日", "greetingName")]:
        if c.get(key):
            result.append(label + "：" + c[key])
    if c.get("event"):
        e = c["event"]
        result += [f"虚构已核实活动：{e['name']}", f"时间：{e['date']}；地点：{e['location']}"]
    result += ["预期场景行为：", c["expectedScenarioBehavior"]]
    return "\n".join(result)


def compact_product(value):
    d = json.loads(value)
    lines = []
    for key, label in [("motif", "Motif"), ("line", "Line")]:
        item = d.get(key)
        if item:
            lines += [f"{label}：{item['name']} · {item['zh']}", item["story"]]
    p = d.get("product")
    if p:
        lines += [f"SKU：{p['sku']} · {p['category']}", "目录描述：" + p["name"], "材质：" + p["material"], "宝石 / 装饰：" + (p.get("gemstone") or "目录未列明"), "虚构目录价：" + p["displayedPrice"]]
    else:
        lines.append("无具体单品；仅使用当前选择层级允许的事实。")
    purchase = d.get("selectedHistoricalPurchase")
    if purchase:
        lines += [f"选定历史购买：{purchase['id']}", f"日期：{purchase['purchaseDate']}；成交价：¥{purchase['purchasePrice']:,.0f}"]
        if purchase.get("advisorNotes"):
            lines.append("购买备注：" + purchase["advisorNotes"])
    lines += ["选择模式：" + str(d.get("selectionMode")), "来源：" + str(d.get("canonicalSource"))]
    return "\n".join(lines)


def format_sheet(ws, widths, row_height=54):
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 85
    ws.freeze_panes = "C2" if ws.title != "Summary" else "B2"
    ws.auto_filter.ref = ws.dimensions
    ws.row_dimensions[1].height = 36
    for idx, width in enumerate(widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(idx)].width = width
    for row in ws:
        for cell in row:
            cell.font = Font(name=FONT, size=10.5, color=INK)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if cell.row == 1:
                cell.fill = PatternFill("solid", fgColor=INK)
                cell.font = Font(name=FONT, size=11, bold=True, color="FFFFFF")
                cell.alignment = Alignment(vertical="center", wrap_text=True)
            elif cell.row % 2 == 0:
                cell.fill = PatternFill("solid", fgColor=LIGHT)
        if row[0].row > 1:
            ws.row_dimensions[row[0].row].height = row_height
    ws.print_options.horizontalCentered = False
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = "1:1"


def fit_rows(ws, columns=None):
    columns = columns or range(1, ws.max_column + 1)
    for row in range(2, ws.max_row + 1):
        needed = max(len(wrap_lines(ws.cell(row, col).value, ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width - 3)) for col in columns)
        height = max(48, needed * 14 + 12)
        if height > 409:
            raise ValueError(f"Row would clip in {ws.title}!{row}: needs {height} points")
        ws.row_dimensions[row].height = height


def patch_formula_caches(raw, caches, destination, refresh=False):
    with zipfile.ZipFile(io.BytesIO(raw)) as source, destination.open("wb" if refresh else "xb") as target:
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as output:
            for info in source.infolist():
                body = source.read(info.filename)
                if info.filename == "xl/worksheets/sheet4.xml":
                    tree = ET.fromstring(body)
                    for cell in tree.iter(f"{{{NS}}}c"):
                        if cell.attrib["r"] not in caches:
                            continue
                        value = caches[cell.attrib["r"]]
                        element = cell.find(f"{{{NS}}}v")
                        if element is None:
                            element = ET.SubElement(cell, f"{{{NS}}}v")
                        if isinstance(value, str):
                            cell.set("t", "str")
                        else:
                            cell.attrib.pop("t", None)
                        element.text = str(value)
                    body = ET.tostring(tree, encoding="utf-8", xml_declaration=True)
                output.writestr(info, body)


def render_preview(ws, data_ws, cell_range, output):
    """Read actual XLSX cells/styles and formula caches; render a verification panel."""
    from openpyxl.utils.cell import range_boundaries
    left, top, right, bottom = range_boundaries(cell_range)
    cols = list(range(left, right + 1))
    widths = {c: round(ws.column_dimensions[openpyxl.utils.get_column_letter(c)].width * 7 + 8) for c in cols}
    heights = {r: round(ws.row_dimensions[r].height * 4 / 3) for r in range(top, bottom + 1)}
    img = Image.new("RGB", (sum(widths.values()), sum(heights.values())), "white")
    draw = ImageDraw.Draw(img)
    face = "/System/Library/Fonts/PingFang.ttc"
    font = ImageFont.truetype(face, 14)
    header_font = ImageFont.truetype(face, 15)
    y = 0
    for r in range(top, bottom + 1):
        x = 0
        for c in cols:
            cell = ws.cell(r, c)
            color = cell.fill.fgColor.rgb if cell.fill.fgColor.type == "rgb" and cell.fill.patternType == "solid" else "FFFFFF"
            draw.rectangle([x, y, x + widths[c], y + heights[r]], fill="#" + str(color)[-6:])
            value = data_ws.cell(r, c).value
            if isinstance(value, float):
                value = f"{value:.1%}" if "%" in cell.number_format else f"{value:,.4f}" if "$" in cell.number_format else f"{value:,.3f}"
            chosen = header_font if r == 1 else font
            text_lines = []
            for line in str("" if value is None else value).split("\n"):
                chunk = ""
                for character in line:
                    if chunk and draw.textlength(chunk + character, font=chosen) > widths[c] - 14:
                        text_lines.append(chunk)
                        chunk = ""
                    chunk += character
                text_lines.append(chunk)
            draw.multiline_text((x + 7, y + 7), "\n".join(text_lines), font=chosen, fill="white" if r == 1 else "#" + INK, spacing=3)
            draw.line([(x, y + heights[r] - 1), (x + widths[c], y + heights[r] - 1)], fill="#DDE5EC")
            x += widths[c]
        y += heights[r]
    img.save(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data_directory")
    parser.add_argument("--refresh-own-export", action="store_true")
    parser.add_argument("--output", default="deliverables/Maison_Liore_50_Cases_Evaluation.xlsx")
    args = parser.parse_args()
    data = read_json(Path(args.data_directory) / "workbook-data.json")
    run = Path(data["sourceRun"])
    manifest, records, summary = [read_json(run / name) for name in ["manifest.json", "records.json", "summary.json"]]
    traces = read_json(run / "provider-traces.json")
    merged = manifest["mode"] == "targeted-merged"
    assert manifest["mode"] in ["live", "targeted-merged"] and len(records) == 50 and summary["actualProviderCalls"] <= 200
    assert all(r["provider"] == "deepseek" and r["source"] == "live" for r in records)
    assert len(traces) == summary["actualProviderCalls"]
    target = ROOT / args.output
    if target.exists() and not args.refresh_own_export:
        raise FileExistsError("Final target already exists; refusing to overwrite")
    evidence = ROOT / "deliverables" / ("live-evaluation-" + run.name.removeprefix("live-"))
    qa = evidence / "workbook-qa"
    if args.refresh_own_export:
        previous = read_json(qa / "verification.json")
        assert previous["xlsxSha256"] == hashlib.sha256(target.read_bytes()).hexdigest(), "Refuse to replace externally modified workbook"
        assert previous["evidenceDirectory"] == str(evidence)
        for original in run.rglob("*"):
            if original.is_file():
                assert original.read_bytes() == (evidence / original.relative_to(run)).read_bytes()
    else:
        shutil.copytree(run, evidence)
        qa.mkdir()
    # Post-run diagnostic observations do not change original deterministic scores.
    findings = {}
    compact = lambda s: "".join(c for c in s if c.isalnum())
    for r in records:
        if not r.get("deterministic") or r["deterministic"]["passed"] or r["input"]["scenario"] != "event":
            continue
        event = r["context"]["event"]
        venue, address = event["location"].split(" · ")
        indexes = sorted({i for f in r["deterministic"]["hard"] if f["ruleId"] == "EVENT_REQUIRED_DETAILS" for i in f["candidateIndexes"]})
        mains = [r["messages"][i]["text"].split("\n\n")[1] for i in indexes]
        if mains and all(compact(venue) in compact(main) and compact(address) in compact(main) and compact(event["name"]) in compact(main) and "12月12日" in main and ("14:00" in main or "下午两点" in main) for main in mains):
            findings[r["id"]] = "Likely validator false positive: venue and street address are both present, in reversed word order. Original FAIL retained; requires adjudication, not regeneration."
        else:
            findings[r["id"]] = "Concise omits the verified venue name. Its claim about prior interest also lacks support in this sparse profile/history. Preserve output and review; no automatic acceptance."
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    cases = wb.create_sheet("50 Test Cases")
    scores = wb.create_sheet("Evaluation Scores")
    defects = wb.create_sheet("Defects & Iteration")
    totals = wb.create_sheet("Summary")
    wb.calculation = CalcProperties(fullCalcOnLoad=True, forceFullCalc=True)
    wb.properties.title = "Maison Lioré — 50 live fictional evaluation cases"
    wb.properties.subject = "Actual DeepSeek outputs, deterministic results and pending quality/human review"
    wb.properties.creator = "Maison Lioré evaluation"
    cases.append(data["columns"])
    for source in data["caseRows"]:
        row = list(source)
        row[2] = compact_client(row[2])
        row[3] = "\n".join(json.loads(row[3])) or "未记录对话历史；不得补造。"
        row[4] = compact_product(row[4])
        cases.append(row)
    format_sheet(cases, [13, 26, 76, 48, 76, 68, 68, 68])
    fit_rows(cases)
    for row in range(2, 52):
        cases.cell(row, 1).font = Font(name=FONT, size=10.5, bold=True, color=INK)
    score_headers = ["Case ID", "Scenario", "Execution status", "Messages retained", "Deterministic validation", "Hard findings / missing reason", "Production factual audit", "API calls", "Retry / repair count", "Total latency (s)", "Input tokens", "Cached input tokens", "Output tokens", "LLM judge method / status", "LLM judge model", "LLM case score", "LLM brand consistency", "LLM naturalness", "LLM personalization", "LLM scenario relevance", "LLM CTA quality", "LLM set differentiation", "Human review status", "Human reviewer", "Human review notes / assignment", "Prompt version", "Final error category", "Recovery failure events", "Selection depth", "Generation timestamp (UTC)"]
    scores.append(score_headers)
    if merged:
        for column, header in enumerate(["Output provenance", "Generation source run", "Validator version", "Original validation status", "Original prompt version"], 31):
            scores.cell(1, column, header)
    sample_ids = set(r["caseId"] for r in data["reviewCases"])
    sample_ids.update(["F-001", "F-009", "F-021", "F-029", "F-039", "F-044", "F-047", "F-049"])
    successful = []
    for definition, r, score in zip(manifest["cases"], records, data["scoreRows"]):
        assert definition["id"] == r["id"] == score["caseId"]
        passed = score["complete"]
        if passed:
            successful.append(r)
        if r.get("recovery", {}).get("failures") or not passed:
            sample_ids.add(r["id"])
        status = "COMPLETED_VALID" if passed else "GENERATED_HARD_FAIL" if r["messages"] else "FAILED_NO_OUTPUT" if r.get("providerAttempts") else "NOT_EXECUTED"
        judgment = r.get("judge") if r.get("judge", {}).get("model") != r["model"] else None
        candidate_judgments = (judgment or {}).get("judgment", {}).get("candidates", [])
        means = [statistics.mean(c["scores"][key] for c in candidate_judgments) if candidate_judgments else None for key in ["brandConsistency", "naturalness", "personalization", "scenarioRelevance", "ctaQuality"]]
        usage = r.get("tokenUsage", {})
        audit_events = [m for m in r.get("performance", {}).get("measurements", []) if m.get("stage") == "brand_audit.validation"]
        audit = "PASS" if r["messages"] else "FAIL" if any(m.get("status") == "failed" for m in audit_events) or (r.get("error", {}).get("stage") or "").startswith("brand_audit") else "NOT_COMPLETED"
        hard = (r.get("deterministic") or {}).get("hard", [])
        review_note = findings.get(r["id"]) or ("Assigned review: representative / difficult / recovered or failed case" if r["id"] in sample_ids else "Pending optional review")
        scores.append([r["id"], next(row[1] for row in data["caseRows"] if row[0] == r["id"]), status, len(r["messages"]), "PASS" if r.get("deterministic", {}).get("passed") else "FAIL" if r.get("deterministic") else "NOT_RUN_NO_OUTPUT", json.dumps(hard or r.get("error") or [], ensure_ascii=False), audit, len(r.get("providerAttempts", [])), (r.get("recovery") or {}).get("retryCount", 0), r["generationMs"] / 1000, usage.get("input"), usage.get("cached"), usage.get("output"), score["judgeMethod"], score["judgeModel"], score["qualityScore"], *means, (judgment or {}).get("judgment", {}).get("differentiation", {}).get("score"), "PENDING", None, review_note, r["promptVersion"], (r.get("error") or {}).get("code"), len((r.get("recovery") or {}).get("failures", [])), definition["context"]["normalized"]["selection"]["depth"], r.get("generatedAt")])
        if merged:
            p = r["provenance"]
            for column, value in enumerate([p["kind"], p["generationSourceRun"], p["selectedValidatorVersion"], "PASS" if p["originalPassed"] else "NO_OUTPUT" if p["originalMessageCount"] == 0 else "FLAGGED", p["originalPromptVersion"]], 31):
                scores.cell(scores.max_row, column, value)
    format_sheet(scores, [13, 26, 25, 16, 22, 65, 23, 14, 16, 18, 17, 19, 17, 45, 25, 16, 20, 20, 20, 22, 20, 22, 22, 24, 55, 22, 25, 20, 18, 30], 76)
    if merged:
        for column, width in enumerate([42, 75, 30, 28, 25], 31):
            scores.column_dimensions[openpyxl.utils.get_column_letter(column)].width = width
    for row in range(2, 52):
        for col in [8, 9, 11, 12, 13, 28, 29]:
            scores.cell(row, col).number_format = "#,##0"
        scores.cell(row, 10).number_format = "0.000"
        for col in range(16, 23):
            scores.cell(row, col).number_format = "0.00"
            scores.cell(row, col).fill = PatternFill("solid", fgColor=AMBER)
    for text, color in [("COMPLETED_VALID", GREEN), ("GENERATED_HARD_FAIL", RED), ("FAILED_NO_OUTPUT", RED)]:
        scores.conditional_formatting.add("C2:C51", FormulaRule(formula=[f'C2="{text}"'], fill=PatternFill("solid", fgColor=color)))
    validation = DataValidation(type="list", formula1='"PENDING,REVIEWED,ADJUDICATION_REQUIRED"')
    scores.add_data_validation(validation)
    validation.add("W2:W51")
    fit_rows(scores)
    defects.append(["Case ID", "Failure type", "Original behavior", "Relevant error", "Remediation", "Retest outcome", "Version"])
    for d in data["defects"]:
        original = d["originalBehavior"]
        if d["failureType"] == "DETERMINISTIC_HARD":
            original = "Returned set retained in 50 Test Cases; see the cited candidate indexes.\n" + str(d["relevantError"].get("ruleId"))
        defects.append([d["caseId"], d["failureType"], original, json.dumps(d["relevantError"], ensure_ascii=False), d["remediation"], d["retestOutcome"], d["version"]])
    original_records = []
    if merged:
        original_records = read_json(Path(manifest["originalRun"]) / "records.json")
        retest_records = []
        for target_run in manifest["targetedRuns"]:
            retest_records += read_json(Path(target_run) / "records.json")
        for original in original_records:
            if original.get("deterministic", {}).get("passed"):
                continue
            current = next(r for r in records if r["id"] == original["id"])
            detail = current["provenance"]["kind"]
            if original["id"] == "F-037":
                detail += ": location word order fixed in validator; original text reused verbatim, zero model calls."
            elif original["id"] in ["F-039", "F-041"]:
                detail += ": ordered-location false positive plus genuine unverified event-topic promise; regenerated under event-facts-v2."
            elif original["id"] == "F-042":
                detail += ": missing venue, invented prior interest and unsupported agenda corrected in targeted generation."
            else:
                detail += ": original rejected text unavailable; new attempt responses fully retained. Repair count/schema conflict fixed."
            defects.append([original["id"], "ORIGINAL_RUN_DEFECT_OR_FALSE_POSITIVE", "Original record and messages retained in Original vs Retest and original evidence", json.dumps(original.get("error") or original.get("deterministic"), ensure_ascii=False), detail, "PASS" if current.get("deterministic", {}).get("passed") else "STILL_INCOMPLETE", current["promptVersion"]])
        for r in retest_records:
            if r.get("error"):
                defects.append([r["id"], "INTERMEDIATE_RETEST_FAILURE", "Failed targeted attempt preserved; not selected as final output", json.dumps(r["error"],ensure_ascii=False), "Known CRM preference was falsely rejected by factual audit; audit source hierarchy corrected in advisor-1.5.2", "Later case-only retest selected; see provenance", r["promptVersion"]])
    if not data["defects"]:
        defects.append([None, "NO_RECORDED_HARD_DEFECTS", "No deterministic or recovery failures recorded in this run; subjective/human review pending.", None, "Complete human review", "PENDING", manifest["promptVersion"]])
    for row in range(2, defects.max_row + 1):
        case_id = defects.cell(row, 1).value
        if case_id in findings:
            defects.cell(row, 5).value = findings[case_id]
    format_sheet(defects, [13, 30, 72, 76, 76, 48, 24])
    fit_rows(defects)
    totals.append(["Metric / scenario", "Measured value", "Scope / denominator", "Interpretation / evidence"])
    caches = {}

    def metric(label, value, scope, note, cached=None, number_format=None):
        totals.append([label, value, scope, note])
        cell = totals.cell(totals.max_row, 2)
        if isinstance(value, str) and value.startswith("="):
            caches[cell.coordinate] = cached
        if number_format:
            cell.number_format = number_format
        return totals.max_row

    complete = len(successful)
    executed = sum(bool(r.get("providerAttempts")) for r in records)
    retained = sum(len(r["messages"]) for r in records)
    hard_failed = sum(bool(r.get("deterministic") and not r["deterministic"]["passed"]) for r in records)
    quality = [r["judge"]["caseScore"] for r in records if r.get("judge") and r["judge"].get("model") != r["model"]]
    latency = sorted(r["generationMs"] / 1000 for r in records)
    metric("Cases prepared", "=COUNTA('50 Test Cases'!A2:A51)", "All planned cases", "Exactly 50 fictional cases", 50, "#,##0")
    metric("Live cases executed", '=COUNTIF(\'Evaluation Scores\'!H2:H51,">0")', "At least one actual provider attempt", "DeepSeek live only; no mock substitution", executed, "#,##0")
    metric("Completed valid cases", '=COUNTIF(\'Evaluation Scores\'!C2:C51,"COMPLETED_VALID")', "Three returned messages and final deterministic PASS", "Completion is separate from quality approval", complete, "#,##0")
    metric("Successful validated messages", '=SUMIF(\'Evaluation Scores\'!C2:C51,"COMPLETED_VALID",\'Evaluation Scores\'!D2:D51)', "Messages from completed valid cases", "Hard-failing retained messages excluded", complete * 3, "#,##0")
    metric("All returned messages retained", "=SUM('Evaluation Scores'!D2:D51)", "Includes sets flagged by extra final checks", "All original returned text retained unchanged", retained, "#,##0")
    metric("Failed / incomplete cases", "=B2-B4", "All prepared cases minus completed valid", "Missing output cells remain genuinely blank", 50 - complete, "#,##0")
    metric("Completion rate", "=IFERROR(B4/B2,0)", "Completed valid / 50 prepared", "Not an overall subjective quality pass rate", complete / 50, "0.0%")
    metric("Final deterministic hard-fail sets", '=COUNTIF(\'Evaluation Scores\'!E2:E51,"FAIL")', "Returned candidate sets", "Missing-output errors are counted separately", hard_failed, "#,##0")
    metric("Final deterministic failure rate", '=IFERROR(B9/COUNTIF(\'Evaluation Scores\'!D2:D51,3),0)', "Hard-fail sets / returned three-message sets", "Production audit failures are distinct recovery events", hard_failed / max(1, retained / 3), "0.0%")
    metric("LLM quality sets scored", "=COUNT('Evaluation Scores'!P2:P51)", "Independent offline judge only", "No independent judge configured; blank scores are not zeros", len(quality), "#,##0")
    metric("Mean independent LLM quality score", '=IF(COUNT(\'Evaluation Scores\'!P2:P51)=0,"PENDING",AVERAGE(\'Evaluation Scores\'!P2:P51))', "Actually scored sets only", "Existing project rubric, 1–5; no scores fabricated", statistics.mean(quality) if quality else "PENDING", "0.00")
    metric("Human-reviewed cases", '=COUNTIF(\'Evaluation Scores\'!W2:W51,"REVIEWED")', "Actual human review annotations", "All human review remains pending", 0, "#,##0")
    metric("API calls", "=SUM('Evaluation Scores'!H2:H51)", "Generation + mandatory factual audits + retries", "Global approved ceiling: 200", len(traces), "#,##0")
    metric("Retry / repair actions", "=SUM('Evaluation Scores'!I2:I51)", "Existing bounded production policy", "No manual out-of-policy regeneration", sum((r.get("recovery") or {}).get("retryCount", 0) for r in records), "#,##0")
    metric("Input tokens", "=SUM('Evaluation Scores'!K2:K51)", "Provider-reported generation/audit usage", "Includes cached subset", sum(t.get("usage", {}).get("input_tokens", 0) for t in traces), "#,##0")
    metric("Cached input tokens", "=SUM('Evaluation Scores'!L2:L51)", "Subset of input tokens", "Provider usage metadata", sum(t.get("usage", {}).get("input_tokens_details", {}).get("cached_tokens", 0) for t in traces), "#,##0")
    metric("Output tokens", "=SUM('Evaluation Scores'!M2:M51)", "Provider usage including failed attempts where supplied", "Not the same as customer message count", sum(t.get("usage", {}).get("output_tokens", 0) for t in traces), "#,##0")
    metric("All-attempt median latency (s)", "=MEDIAN('Evaluation Scores'!J2:J51)", "All 50 cases, failures included", "Direct production generation pipeline; excludes browser paint", statistics.median(latency), "0.000")
    metric("All-attempt nearest-rank p95 (s)", "=SMALL('Evaluation Scores'!J2:J51,ROUNDUP(COUNT('Evaluation Scores'!J2:J51)*0.95,0))", "All 50 cases, failures included", "Nearest-rank estimator; scenario samples remain small", latency[math.ceil(.95 * len(latency)) - 1], "0.000")
    metric("Input cache-miss rate / 1M USD", .15, "Off-peak Flash; actual run is Saturday UTC", "https://api-docs.deepseek.com/quick_start/pricing/", number_format='"$"0.000')
    metric("Input cache-hit rate / 1M USD", .003, "Off-peak Flash", "Published rates checked November 7, 2026", number_format='"$"0.000')
    metric("Output rate / 1M USD", .6, "Off-peak Flash", "Token estimate, not a billing invoice", number_format='"$"0.000')
    tokens_in = sum(t.get("usage", {}).get("input_tokens", 0) for t in traces)
    tokens_cache = sum(t.get("usage", {}).get("input_tokens_details", {}).get("cached_tokens", 0) for t in traces)
    tokens_out = sum(t.get("usage", {}).get("output_tokens", 0) for t in traces)
    cost = ((tokens_in - tokens_cache) * .15 + tokens_cache * .003 + tokens_out * .6) / 1e6
    metric("Estimated actual API cost (USD)", "=((B16-B17)*B21+B17*B22+B18*B23)/1000000", "Provider-reported token usage; off-peak rates", "Not an account invoice; unknown usage excluded", cost, '"$"0.0000')
    metric("Calls without reported token usage", sum(not t.get("usage") for t in traces), "All actual provider attempts", "If nonzero, cost is partial rather than a complete estimate", number_format="#,##0")
    metric("Requested / returned model", manifest["model"], "DeepSeek Responses API", ", ".join(sorted({str(t.get("returnedModel")) for t in traces})))
    metric("Production prompt version", manifest["promptVersion"], "Generation unchanged for this run", "Prompt fingerprints and source hashes in manifest / traces")
    metric("Brand Bible", manifest["brandBibleVersion"], manifest["brandSourceSha256"], "Canonical fictional catalog; no unofficial products")
    metric("Case set", manifest["caseSetVersion"], manifest["gitCommit"], "Uncommitted evaluation harness changes fingerprinted in manifest")
    metric("Application clock", manifest["evaluationTime"], "Frozen scenario calendar in Asia/Shanghai", "Actual generation timestamps recorded per case")
    metric("Independent quality judge", "PENDING / NOT CONFIGURED", "Zero independent judge calls", "Mandatory same-provider factual audit is not independent quality scoring")
    metric("Human review", "PENDING", f"{len(sample_ids)} assigned representative/difficult/recovered/failed cases", "See human-review-sample.json and Evaluation Scores notes")
    metric("Overall deliverable status", "COMPLETE_OUTPUTS_REVIEW_PENDING" if complete == 50 else "INCOMPLETE_LIVE_OUTPUTS", "50 cases / 150 valid messages required for output completeness", "Do not claim completion while any output set is missing or hard-failing")
    metric("Evidence directory", str(evidence.relative_to(ROOT)), "Full immutable copy of this live run", "Raw JSONL/CSV, failed checkpoints, traces and blank human forms preserved")
    metric("Scenario breakdown", None, "Prepared / completed / messages", "See next six rows; valid messages only")
    for scenario in ["greeting", "recommend", "care", "reactivate", "event", "price"]:
        group = [r for r in records if r["input"]["scenario"] == scenario]
        valid = [r for r in group if r.get("deterministic", {}).get("passed") and len(r["messages"]) == 3]
        label = next(row[1] for row in data["caseRows"] if row[0] == group[0]["id"])
        metric(label, f'=COUNTIFS(\'Evaluation Scores\'!B2:B51,A{totals.max_row + 1},\'Evaluation Scores\'!C2:C51,"COMPLETED_VALID")', f"{len(group)} prepared; {len(valid) * 3} valid messages", f"{len(group)-len(valid)} incomplete; no independent quality mean measured", len(valid), "#,##0")
    metric("Event-check diagnostic caveat", "3 likely order-sensitive false positives", "F-037, F-039, F-041; original FAIL unchanged", "Both canonical venue/address appear in reversed order. F-042 genuinely omits venue in Concise; review its unsupported history claim too.")
    if merged:
        comparison = wb.create_sheet("Original vs Retest")
        comparison.append(["Case ID", "Scenario", "Original status", "Original prompt", "Original validator", "Original message count", "Original Output 1", "Original Output 2", "Original Output 3", "Selected status", "Output source", "Selected prompt", "Selected validator", "New generation in targeted work", "Targeted API calls", "Targeted input tokens", "Targeted cached input", "Targeted output tokens", "Original error / findings", "Targeted intermediate statuses"])
        for original, selected in zip(original_records, records):
            attempts = [r for r in retest_records if r["id"] == original["id"]]
            target_traces = [t for t in traces if t.get("cohort") == "targeted-retest" and t["caseId"] == original["id"]]
            comparison.append([original["id"], next(row[1] for row in data["caseRows"] if row[0] == original["id"]), "PASS" if original.get("deterministic", {}).get("passed") else "NO_OUTPUT" if not original["messages"] else "FLAGGED", original["promptVersion"], original.get("deterministic", {}).get("version"), len(original["messages"]), *[original["messages"][i]["text"] if len(original["messages"]) > i else None for i in range(3)], "PASS" if selected.get("deterministic", {}).get("passed") else "INCOMPLETE", selected["provenance"]["kind"], selected["promptVersion"], selected.get("deterministic", {}).get("version"), "YES" if attempts else "NO", len(target_traces), sum(t.get("usage", {}).get("input_tokens", 0) for t in target_traces), sum(t.get("usage", {}).get("input_tokens_details", {}).get("cached_tokens", 0) for t in target_traces), sum(t.get("usage", {}).get("output_tokens", 0) for t in target_traces), json.dumps(original.get("error") or original.get("deterministic"),ensure_ascii=False), "; ".join(r["promptVersion"] + ": " + ("PASS" if r.get("deterministic", {}).get("passed") else str(r.get("error", {}).get("code"))) for r in attempts)])
        format_sheet(comparison, [13,26,20,23,30,18,68,68,68,22,45,24,30,24,18,22,22,22,65,65])
        fit_rows(comparison)
        original_summary = read_json(Path(manifest["originalRun"]) / "summary.json")
        original_traces = [t for t in traces if t.get("cohort") == "original"]
        original_api_row = metric("Original-run API calls", len(original_traces), "Immutable original run", "Not rerun; includes all original failures and repairs", number_format="#,##0")
        original_input_row = metric("Original input tokens", sum(t["usage"]["input_tokens"] for t in original_traces), "Immutable original usage", "Includes failed attempts", number_format="#,##0")
        original_cache_row = metric("Original cached input tokens", sum(t["usage"].get("input_tokens_details",{}).get("cached_tokens",0) for t in original_traces), "Immutable original usage", "Subset of original input", number_format="#,##0")
        original_output_row = metric("Original output tokens", sum(t["usage"]["output_tokens"] for t in original_traces), "Immutable original usage", "Original provider-reported tokens", number_format="#,##0")
        totals["B14"] = f"=B{original_api_row}+SUM('Original vs Retest'!O2:O51)"
        totals["B16"] = f"=B{original_input_row}+SUM('Original vs Retest'!P2:P51)"
        totals["B17"] = f"=B{original_cache_row}+SUM('Original vs Retest'!Q2:Q51)"
        totals["B18"] = f"=B{original_output_row}+SUM('Original vs Retest'!R2:R51)"
        totals["A14"] = "Cumulative paid API calls"
        totals["C14"] = "Original + targeted calls, including failures"
        totals["A6"] = "Selected current messages"
        totals["C6"] = "Current 50-case view; originals retained separately"
        totals["D6"] = "Original messages remain unchanged on Original vs Retest and in original workbook"
        totals["B15"] = original_summary["generationRecoveryInEvidence"]["outputRepairs"] + summary["retestRecoveryActions"]
        caches.pop("B15", None)
        totals["A19"] = "Selected-source median latency (s)"
        totals["A20"] = "Selected-source nearest-rank p95 (s)"
        totals["C19"] = totals["C20"] = "Mixed original and targeted source generation latencies"
        totals["C27"] = "Originals advisor-1.5.0; targeted advisor-1.5.1 / 1.5.2"
        totals["D27"] = "Each row records actual generation and validator versions"
        totals["B42"] = "F-037 revalidated offline; F-039/F-041 had additional genuine agenda defects"
        totals["C42"] = "Original statuses preserved on Original vs Retest"
        totals["D42"] = "Only eight distinct cases regenerated; other 42 original output sets reused"
        metric("Original passing cases", original_summary["deterministicPassed"], "Original frozen result", "Original workbook remains unchanged", number_format="#,##0")
        metric("Distinct cases regenerated", 8, "Only affected allowlisted inputs", "No full 50-case rerun", number_format="#,##0")
        metric("Additional paid API calls", '=SUM(\'Original vs Retest\'!O2:O51)', "All targeted rounds; includes intermediate failures", "No independent judge calls", summary["additionalProviderCalls"], "#,##0")
        metric("Offline revalidation only", "F-037", "Zero new messages generated for this case", "Corrected venue/address order sensitivity; genuine facts remain required")
        metric("Original released messages preserved", sum(len(r["messages"]) for r in original_records), "Immutable original 50-case run", "All original output text, including flagged sets, retained", number_format="#,##0")
        metric("Targeted released messages", sum(len(r["messages"]) for r in retest_records), "All targeted generation rounds", "Raw rejected provider responses are also archived separately", number_format="#,##0")
    format_sheet(totals, [44, 42, 78, 90], 56)
    totals.column_dimensions["B"].width = 42
    for row in range(2, totals.max_row + 1):
        totals.cell(row, 2).font = Font(name=FONT, size=11, bold=True, color=INK)
        if isinstance(totals.cell(row, 2).value, str) and "PENDING" in totals.cell(row, 2).value:
            totals.cell(row, 2).fill = PatternFill("solid", fgColor=AMBER)
    for row in [4, 5, 7, 24, 33]:
        totals.cell(row, 2).fill = PatternFill("solid", fgColor=GREEN if complete == 50 else AMBER)
    totals["B21"].comment = Comment("Source: https://api-docs.deepseek.com/quick_start/pricing/; Flash off-peak USD per million tokens, checked 2026-11-07. All observed calls ran on Saturday UTC.", "User")
    totals["B20"].comment = Comment("Nearest-rank p95 = sorted observations at ceil(0.95 × n), including all failed cases. Not PERCENTILE.INC interpolation.", "User")
    # All quality scores stay blank when no independent judge ran.
    if not quality:
        assert all(scores.cell(r, c).value is None for r in range(2, 52) for c in range(16, 23))
    memory = io.BytesIO()
    wb.save(memory)
    patch_formula_caches(memory.getvalue(), caches, target, args.refresh_own_export)
    formula_book = openpyxl.load_workbook(target, data_only=False)
    value_book = openpyxl.load_workbook(target, data_only=True)
    assert formula_book.sheetnames == ["50 Test Cases", "Evaluation Scores", "Defects & Iteration", "Summary"] + (["Original vs Retest"] if merged else [])
    assert formula_book["50 Test Cases"].max_row == 51 and formula_book["50 Test Cases"].max_column == 8
    assert [c.value for c in formula_book["50 Test Cases"][1]] == data["columns"]
    for row_number, source in enumerate(data["caseRows"], 2):
        assert [formula_book["50 Test Cases"].cell(row_number, c).value for c in [6, 7, 8]] == source[5:]
    for coordinate, expected in caches.items():
        actual = value_book["Summary"][coordinate].value
        assert actual == expected or isinstance(actual, (int, float)) and math.isclose(actual, expected, rel_tol=1e-12), (coordinate, actual, expected)
    assert all(ws.freeze_panes and ws.auto_filter.ref for ws in formula_book)
    errors = {"#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"}
    assert not any(c.data_type == "e" or str(c.value) in errors for ws in value_book for row in ws for c in row)
    previews = [("50 Test Cases", "A1:E3", "cases-inputs.png"), ("50 Test Cases", "F1:H3", "cases-outputs.png"), ("Evaluation Scores", "A1:J4", "scores-validation.png"), ("Evaluation Scores", "N1:Z4", "scores-review.png"), ("Defects & Iteration", "A1:G4", "defects.png"), ("Summary", "A1:D13", "summary.png")]
    if merged:
        previews += [("Evaluation Scores","AE14:AI19","source-provenance.png"),("Original vs Retest","J14:T19","comparison.png")]
    for sheet, region, file in previews:
        render_preview(formula_book[sheet], value_book[sheet], region, qa / file)
    (evidence / "human-review-sample.json").write_text(json.dumps([{"caseId":r["id"],"selectionReason":"failure/recovery" if not r.get("deterministic", {}).get("passed") or r.get("recovery", {}).get("failures") else "representative/difficult", "input":r["input"],"messages":r["messages"],"reviewer":None,"reviewedAt":None,"scores":None,"status":"PENDING_HUMAN_REVIEW"} for r in records if r["id"] in sample_ids], ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    (evidence / "post-run-observations.json").write_text(json.dumps({"method":"Code/record inspection; no new model calls and not human review","originalValidationChanged":False,"findings":findings},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    result = {"preparedCases":50,"liveCasesExecuted":executed,"completedValidCases":complete,"successfulMessages":complete*3,"allReturnedMessagesRetained":retained,"failedOrIncompleteCases":50-complete,"missingOutputCases":[r["id"] for r in records if not r["messages"]],"hardFailOutputSets":[r["id"] for r in records if r.get("deterministic") and not r["deterministic"]["passed"]],"apiCalls":len(traces),"paidCallCap":200,"tokens":{"input":tokens_in,"cachedInput":tokens_cache,"output":tokens_out},"estimatedCostUsd":cost,"callsWithoutUsage":sum(not t.get("usage") for t in traces),"independentJudgeCases":len(quality),"humanReviewedCases":0,"humanReviewStatus":"PENDING","formulaCellsVerified":len(caches),"allMessageCellsMatchSource":True,"workbook":str(target),"evidenceDirectory":str(evidence),"xlsxSha256":hashlib.sha256(target.read_bytes()).hexdigest(),"previews":[file for _,_,file in previews]}
    (qa / "verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
