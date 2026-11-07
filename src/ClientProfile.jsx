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
    </section>
  );
}
