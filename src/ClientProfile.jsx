import React from "react";
import { resolvePurchaseDisplay } from "./product-display.mjs";

export default function ClientProfile({ client, catalog }) {
  return (
    <section className="client-profile" aria-labelledby="client-profile-name">
      <div className="profile-heading">
        <span className="tiny-eyebrow">CLIENT PROFILE</span>
        <span className="profile-caption">已存客户资料</span>
      </div>
      <h2 id="client-profile-name">{client.name}</h2>
      <div className="profile-details">
        <span className="advisor-assignment">
          珠宝顾问 <strong>{client.assignedAdvisor}</strong>
        </span>
        <span className="profile-detail-divider" aria-hidden="true">
          ·
        </span>
        <span className="profile-birth-month">
          生日月 <strong>{client.birthMonth} 月</strong>
        </span>
      </div>
      <section className="platform-predictions" aria-label="平台模拟预测">
        <div className="purchase-history-heading">
          <span>
            平台模拟预测 <small>Simulated Platform Predictions</small>
          </span>
        </div>
        <p className="prediction-disclaimer">
          仅为模拟推荐，不代表客户明确表达的偏好或历史购买。
        </p>
        {(client.predictedInterests || []).map((prediction) => {
          const display = resolvePurchaseDisplay(prediction, catalog);
          return (
            <div className="prediction-row" key={prediction.sku}>
              <span className="prediction-rank">{prediction.rank}</span>
              <div>
                <strong>{display.label}</strong>
                <small>
                  {prediction.sku} · {display.motif?.zh}
                </small>
                <p>{prediction.rationale}</p>
              </div>
            </div>
          );
        })}
      </section>
      <section className="purchase-history" aria-label="历史购买">
        <div className="purchase-history-heading">
          <span>
            历史购买 <small>Purchase History</small>
          </span>
        </div>
        {client.purchases.length ? (
          client.purchases.map((purchase) => {
            const display = resolvePurchaseDisplay(purchase, catalog);
            return (
              <div key={purchase.id} className="purchase-history-row">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <strong title={display.description ?? undefined}>
                    {display.label}
                  </strong>
                  <small>
                    {display.sku}
                    {purchase.purchaseDate && (
                      <>
                        {" "}
                        ·{" "}
                        <time dateTime={purchase.purchaseDate}>
                          {purchase.purchaseDate}
                        </time>
                      </>
                    )}
                  </small>
                </div>
              </div>
            );
          })
        ) : (
          <p className="profile-empty-history">暂无历史购买记录</p>
        )}
      </section>
      <section className="profile-conversations" aria-label="历史沟通">
        <div className="purchase-history-heading">
          <span>
            历史沟通 <small>Conversation History</small>
          </span>
        </div>
        {client.history?.length ? (
          client.history.map((text, index) => <p key={index}>{text}</p>)
        ) : (
          <p className="profile-empty-history">暂无历史沟通记录</p>
        )}
      </section>
    </section>
  );
}
