import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보제공 동의 및 취급방침 | FEED LIFE",
  description: "피드백(브랜드명 FEED LIFE) 개인정보제공 동의 및 취급방침",
};

export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "32px 20px 64px",
        color: "#212529",
        lineHeight: 1.7,
        fontFamily:
          'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.3 }}>
        개인정보제공 동의 및 취급방침
      </h1>
      <p style={{ margin: "0 0 28px", color: "#495057", fontSize: 15 }}>
        * 본 동의서는 피드백(브랜드명 FEED LIFE)가 개인정보처리자로서 수집 · 이용합니다.
      </p>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 16px" }}>1. 수집 · 이용에 관한 사항</h2>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>수집 · 이용목적</h3>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <li>FEED LIFE 채용 상담 진행 및 관련 안내 제공</li>
          <li>FEED LIFE에 대한 채용 정보 및 지원 방법 등 안내 제공</li>
          <li>상담 후 추가적인 지원 안내 및 관련 서비스에 대한 안내 제공</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>보유 및 이용기간</h3>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <li>보유기간은 동의일로부터 1년이며 이후에는 지체 없이 파기됩니다.</li>
        </ul>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>거부 권리 및 불이익</h3>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <li>귀하는 아래 개인(신용)정보 수집, 이용에 관한 동의를 거부하실 수 있습니다.</li>
          <li>동의 거부 시 불이익은 없으나 FEED LIFE의 상담 서비스는 제공되지 않습니다.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 16px" }}>2. 수집 · 이용항목</h2>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>개인(신용) 정보</h3>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <li>일반 개인정보 : 성명, 거주지, 연령대, 전화번호, 상담 가능시간, 직업</li>
          <li>위 개인정보를 수집/이용 하는 것에 동의합니다.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 16px" }}>3. 제공받는 자</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            태양라이프 주식회사
            <div style={{ color: "#495057" }}>: 상품 공급사, 고객 데이터 관리</div>
          </li>
          <li style={{ marginTop: 10 }}>
            세일즈 파트너
            <div style={{ color: "#495057" }}>
              : 당사와 영업 권한 관련 위촉 계약 체결을 완료한 영업인
            </div>
          </li>
        </ul>
      </section>

      <hr style={{ border: 0, borderTop: "1px solid #dee2e6", margin: "0 0 36px" }} />

      <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.3 }}>
        마케팅 활용을 위한 개인정보 제공 동의
      </h1>
      <p style={{ margin: "0 0 28px", color: "#495057", fontSize: 15 }}>
        * 본 동의서는 FEED LIFE가 개인정보처리자로서 수집 · 이용합니다.
      </p>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 16px" }}>1. 수집 · 이용에 관한 사항</h2>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>개인정보의 수집 및 이용 목적</h3>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          <li>&apos;FEED LIFE&apos; 상담 서비스 관련 정보 제공 및 안내</li>
          <li>채용 이벤트 및 프로모션 안내</li>
          <li>채용 시장 조사 및 서비스 품질 향상</li>
        </ul>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 16px" }}>2. 수집 · 이용 항목</h2>
        <p style={{ margin: 0 }}>성명, 거주지, 연령대, 성별, 전화번호, 직업</p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 12px" }}>개인정보의 보유 및 이용 기간</h2>
        <p style={{ margin: 0 }}>
          본 동의서에 따라 수집된 개인정보는 수집일로부터 1년 간 보관되며, 목적 달성 후 안전하게
          폐기됩니다.
        </p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 12px" }}>동의 거부 권리 및 불이익</h2>
        <p style={{ margin: "0 0 8px" }}>
          귀하는 본 동의를 거부하실 수 있으며, 거부하신 경우에도 &apos;FEED LIFE&apos; 서비스
          이용에는 제한이 없습니다.
        </p>
        <p style={{ margin: 0 }}>
          다만, 마케팅 정보 제공 등 부가 혜택 안내가 제한될 수 있습니다.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
          위 개인정보를 수집/이용 하는 것에 동의합니다.
        </p>
        <p style={{ margin: 0, fontWeight: 600 }}>
          채용 마케팅 광고성 정보(전화/문자/카카오톡/이메일) 수신에 동의합니다.
        </p>
      </section>
    </main>
  );
}
