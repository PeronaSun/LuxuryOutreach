from pathlib import Path
import json, io, math, hashlib, datetime, unicodedata, zipfile, subprocess, tempfile, argparse, xml.etree.ElementTree as ET
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.comments import Comment
from openpyxl.workbook.properties import CalcProperties
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Export fixed fictional client data; no model calls')
parser.add_argument('--output',default='deliverables/client_info.xlsx')
args=parser.parse_args()
work=Path(tempfile.mkdtemp(prefix='maison-client-info-post-v5-'))
source="import fs from 'node:fs';import crypto from 'node:crypto';import {clients} from './data/clients.mjs';import{products,motifs,lines}from'./data/catalog.mjs';const hashes=Object.fromEntries(['data/clients.mjs','data/catalog.mjs','data/platform-predictions.json'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));console.log(JSON.stringify({clients,products,motifs,lines,hashes}))"
data=json.loads(subprocess.check_output(['node','--input-type=module','-e',source],cwd=root,text=True))
target=root/args.output
target.parent.mkdir(parents=True,exist_ok=True)
if target.exists():raise FileExistsError(target)
clients=data['clients'];products={p['sku']:p for p in data['products']}
motifs={p['id']:p for p in data['motifs']};lines={p['id']:p for p in data['lines']}
def label(mapping,key):
 item=mapping.get(key)
 return f"{item['name']} · {item['zh']}" if item else ''
def width(s):return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 0 if unicodedata.combining(c) else 1 for c in str(s))
def wrapped(value,limit):
 result=[]
 for line in str('' if value is None else value).split('\n'):
  part=''
  for char in line:
   if part and width(part+char)>limit:result.append(part);part=''
   part+=char
  result.append(part)
 return result

wb=openpyxl.Workbook();main=wb.active;main.title='客户信息';purchases=wb.create_sheet('购买明细');predictions=wb.create_sheet('平台模拟预测')
wb.calculation=CalcProperties(fullCalcOnLoad=True,forceFullCalc=True)
wb.properties.title='Maison Lioré 虚拟客户信息'
wb.properties.description='Post-V5：9位虚拟客户、12条历史购买及15条固定平台模拟预测；预测不是客户明确偏好，生日仅有月份。'
main.append(['客户ID','客户姓名','CA','生日月份','客户备注','历史兴趣','平台模拟预测（非客户明确偏好）','近期明确偏好','历史沟通记录','历史购买记录','购买次数','历史购买总额（元）'])
purchases.append(['客户ID','客户姓名','CA','购买记录ID','购买日期','Motif／自然意象','Line／设计系列','SKU','品类','产品描述','材质','宝石／装饰','购买金额（元）','购买场合','购买备注'])
predictions.append(['客户ID','客户姓名','CA','预测排名','SKU','Motif／自然意象','Line／设计系列','品类','产品描述','材质','目录价（元）','模拟理由','数据性质','模拟版本'])
occasions={'personal':'自用','wedding':'婚礼','gift':'送礼'}
caches={}
for c in clients:
 interests=[]
 for item in c['interests']:
  fields=[]
  if item.get('motif'):fields.append('Motif：'+label(motifs,item['motif']))
  if item.get('line'):fields.append('Line：'+label(lines,item['line']))
  for key,title in [('category','品类'),('sku','SKU'),('material','材质'),('gemstone','宝石')]:
   if item.get(key):fields.append(title+'：'+item[key])
  interests.append('\n'.join(fields))
 predicted=[]
 for prediction in c['predictedInterests']:
  product=products[prediction['sku']]
  predicted.append(f"#{prediction['rank']}｜{prediction['sku']}｜{label(lines,product['line'])} {product['category']}")
  predictions.append([c['id'],c['name'],c['assignedAdvisor'],prediction['rank'],prediction['sku'],label(motifs,product['motif']),label(lines,product['line']),product['category'],product['name'],product['material'],product['price'],prediction['rationale'],'平台模拟预测；非客户明确偏好',prediction['version']])
 history=[]
 for p in c['purchases']:
  product=products[p['sku']]
  history.append(f"{p['purchaseDate']}｜{p['sku']}｜{p['productName']}｜¥{p['purchasePrice']:,}｜{occasions.get(p.get('occasion'),'场合未记录')}")
  purchases.append([c['id'],c['name'],c['assignedAdvisor'],p['id'],datetime.datetime.strptime(p['purchaseDate'],'%Y-%m-%d'),label(motifs,p['motif']),label(lines,p['line']),p['sku'],p['category'],p['productName'],product['material'],product.get('gemstone') or '未列明',p['purchasePrice'],occasions.get(p.get('occasion'),'未记录'),p.get('advisorNotes') or '未记录'])
 main.append([c['id'],c['name'],c['assignedAdvisor'],c['birthMonth'],c.get('note') or '未记录','\n\n'.join(interests) or '未记录','\n\n'.join(predicted),(c.get('latestPreference') or {}).get('text') or '未记录','\n'.join(c['history']) or '未记录','\n\n'.join(history) or '无历史购买记录',None,None])
 row=main.max_row
 main.cell(row,11,f'=COUNTIF(\'购买明细\'!$A$2:$A$13,A{row})')
 main.cell(row,12,f'=SUMIF(\'购买明细\'!$A$2:$A$13,A{row},\'购买明细\'!$M$2:$M$13)')
 caches[f'K{row}']=len(c['purchases']);caches[f'L{row}']=sum(p['purchasePrice'] for p in c['purchases'])

def style(ws,widths):
 ws.freeze_panes='D2';ws.auto_filter.ref=ws.dimensions;ws.sheet_view.showGridLines=False;ws.sheet_view.zoomScale=85
 for col,w in enumerate(widths,1):ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width=w
 for row in ws:
  for cell in row:
   cell.font=Font(name='PingFang SC',size=11,color='233F5A')
   cell.alignment=Alignment(wrap_text=True,vertical='top')
   if cell.row==1:
    cell.fill=PatternFill('solid',fgColor='233F5A');cell.font=Font(name='PingFang SC',size=11,bold=True,color='FFFFFF');cell.alignment=Alignment(wrap_text=True,vertical='center')
   elif cell.row%2==0:cell.fill=PatternFill('solid',fgColor='EEF3F7')
  r=row[0].row
  if r>1:
   count=max(len(wrapped(cell.value,widths[cell.column-1]-3)) if cell.data_type!='f' else 1 for cell in row)
   ws.row_dimensions[r].height=max(58,count*15+14)
 ws.row_dimensions[1].height=36
 ws.print_title_rows='1:1';ws.page_setup.orientation='landscape';ws.sheet_properties.pageSetUpPr.fitToPage=True;ws.page_setup.fitToWidth=1;ws.page_setup.fitToHeight=0
style(main,[14,14,18,14,32,48,70,40,52,84,14,25])
style(purchases,[14,14,18,22,17,40,40,19,12,48,20,20,24,18,55])
style(predictions,[14,14,18,14,20,40,40,12,48,20,24,72,38,38])
predictions['A1'].comment=Comment('固定种子 20261107；data/platform-predictions.json。只表示平台模拟排序，不是客户说过、喜欢过或购买过的事实。','User')
main['G1'].comment=Comment('平台模拟预测，固定后不随请求变化；排名1优先。不得当成客户明确偏好。详情在平台模拟预测工作表。','User')
main['D1'].comment=Comment('原始资料仅包含生日月份，未记录生日具体日期或出生年份。','User')
main['A1'].comment=Comment('资料来源：data/clients.mjs；全部客户为虚构演示资料。','User')
purchases['J1'].comment=Comment('购买记录：data/clients.mjs；产品描述、材质和宝石信息：data/catalog.mjs。','User')
for r in range(2,11):
 main.cell(r,4).number_format='0"月"';main.cell(r,11).number_format='0';main.cell(r,12).number_format='#,##0'
for r in range(2,14):purchases.cell(r,5).number_format='yyyy-mm-dd';purchases.cell(r,13).number_format='#,##0'

for r in range(2,predictions.max_row+1):predictions.cell(r,4).number_format='0';predictions.cell(r,11).number_format='#,##0'

buffer=io.BytesIO();wb.save(buffer)
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';ET.register_namespace('',ns)
with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as original,target.open('xb') as outfile:
 with zipfile.ZipFile(outfile,'w',zipfile.ZIP_DEFLATED) as out:
  for member in original.infolist():
   body=original.read(member.filename)
   if member.filename=='xl/worksheets/sheet1.xml':
    tree=ET.fromstring(body)
    for cell in tree.iter('{'+ns+'}c'):
     if cell.attrib['r'] in caches:
      value=cell.find('{'+ns+'}v')
      if value is None:value=ET.SubElement(cell,'{'+ns+'}v')
      value.text=str(caches[cell.attrib['r']])
    body=ET.tostring(tree,encoding='utf-8',xml_declaration=True)
   out.writestr(member,body)
actual=openpyxl.load_workbook(target,data_only=False);values=openpyxl.load_workbook(target,data_only=True)
assert actual['客户信息'].max_row==10 and actual['购买明细'].max_row==13 and actual['平台模拟预测'].max_row==16
for key,expected in caches.items():assert values['客户信息'][key].value==expected
for i,c in enumerate(clients,2):
 assert actual['客户信息'].cell(i,1).value==c['id'] and actual['客户信息'].cell(i,3).value==c['assignedAdvisor'] and actual['客户信息'].cell(i,4).value==c['birthMonth']
for p,h in data['hashes'].items():assert hashlib.sha256((root/p).read_bytes()).hexdigest()==h

font=ImageFont.truetype('/System/Library/Fonts/PingFang.ttc',15)
def preview(name,left,right,bottom,file):
 ws=actual[name];vs=values[name];cols=list(range(left,right+1));widths={c:round(ws.column_dimensions[openpyxl.utils.get_column_letter(c)].width*7+8) for c in cols};heights={r:round(ws.row_dimensions[r].height*4/3) for r in range(1,bottom+1)}
 img=Image.new('RGB',(sum(widths.values()),sum(heights.values())),'white');draw=ImageDraw.Draw(img);y=0
 for r in range(1,bottom+1):
  x=0
  for c in cols:
   draw.rectangle([x,y,x+widths[c],y+heights[r]],fill='#233F5A' if r==1 else '#EEF3F7' if r%2==0 else 'white')
   v=vs.cell(r,c).value
   if isinstance(v,datetime.datetime):v=v.strftime('%Y-%m-%d')
   if name=='客户信息' and c==4 and r>1:v=str(v)+'月'
   text=[]
   for line in str('' if v is None else v).split('\n'):
    part=''
    for char in line:
     if part and draw.textlength(part+char,font=font)>widths[c]-14:text.append(part);part=''
     part+=char
    text.append(part)
   draw.multiline_text((x+7,y+7),'\n'.join(text),font=font,fill='white' if r==1 else '#233F5A',spacing=4)
   x+=widths[c]
  y+=heights[r]
 img.save(work/file)
preview('客户信息',1,7,3,'clients.png');preview('客户信息',8,12,3,'client-purchases.png');preview('购买明细',1,10,4,'purchases.png');preview('平台模拟预测',1,14,4,'predictions.png')
print(json.dumps({'file':str(target),'clients':9,'purchases':12,'formulaCellsVerified':len(caches),'predictions':15,'previewDirectory':str(work),'sourceFilesUnchanged':True},ensure_ascii=False))
