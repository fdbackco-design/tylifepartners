import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보 수집·이용 및 마케팅 동의 | FEED LIFE",
  description: "피드백(브랜드명 FEED LIFE) 상담·맞춤 정보·마케팅·광고성 정보 수신 동의 안내",
};

export default function PrivacyPolicyPage() {
  const sectionStyle = { marginBottom: 36 } as const;
  const h2 = { fontSize: 20, fontWeight: 800, margin: "0 0 12px" } as const;
  const h3 = { fontSize: 16, fontWeight: 700, margin: "16px 0 8px" } as const;
  const ul = { margin: "0 0 8px", paddingLeft: 20 } as const;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 64px",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <article
        style={{
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
          padding: "32px 20px 40px",
          color: "#212529",
          lineHeight: 1.7,
          fontFamily:
            'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.3 }}>
          개인정보 수집·이용 및 마케팅 동의
        </h1>
        <p style={{ margin: "0 0 28px", color: "#495057", fontSize: 15 }}>
          피드백(브랜드명 FEED LIFE) 상담 신청 시 수집·이용되는 동의 항목 안내입니다.
        </p>

        <section style={sectionStyle}>
          <h2 style={h2}>1. [필수] 상담을 위한 개인정보 동의</h2>
          <h3 style={h3}>개인정보 수집·이용 동의</h3>
          <p style={{ margin: "0 0 12px" }}>
            피드백(브랜드명 FEED LIFE)은 고객의 상담 신청 및 진행을 위해 다음과 같이 개인정보를
            수집·이용합니다.
          </p>
          <h3 style={h3}>수집·이용 목적</h3>
          <ul style={ul}>
            <li>상담 신청 접수</li>
            <li>본인 확인 및 상담 연락</li>
            <li>상담 일정 조정</li>
            <li>문의사항 대응</li>
            <li>상담 이력 관리</li>
          </ul>
          <h3 style={h3}>수집·이용 항목</h3>
          <ul style={ul}>
            <li>성명</li>
            <li>휴대전화번호</li>
            <li>상담 희망 시간</li>
            <li>문의 내용</li>
          </ul>
          <h3 style={h3}>보유·이용 기간</h3>
          <ul style={ul}>
            <li>상담 종료일로부터 1년</li>
            <li>단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관</li>
          </ul>
          <h3 style={h3}>동의 거부 권리 및 불이익</h3>
          <ul style={ul}>
            <li>귀하는 개인정보 수집·이용에 대한 동의를 거부할 수 있습니다.</li>
            <li>
              다만, 위 정보는 상담 진행에 필요한 필수정보이므로 동의하지 않을 경우 상담 신청 및 상담
              서비스 제공이 어려울 수 있습니다.
            </li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>2. [선택] 맞춤 상담 정보 활용 동의</h2>
          <h3 style={h3}>맞춤 상담을 위한 추가정보 수집·이용 동의</h3>
          <p style={{ margin: "0 0 12px" }}>
            피드백(브랜드명 FEED LIFE)은 고객의 상황과 관심 분야를 반영한 맞춤 상담 및 상품 추천을
            위해 다음과 같이 추가정보를 수집·이용합니다.
          </p>
          <h3 style={h3}>수집·이용 목적</h3>
          <ul style={ul}>
            <li>고객 상황에 맞는 상담 제공</li>
            <li>관심 분야에 따른 상품 및 서비스 추천</li>
            <li>희망 조건을 반영한 맞춤형 안내</li>
            <li>상담 및 추천 정확도 향상</li>
          </ul>
          <h3 style={h3}>수집·이용 항목</h3>
          <ul style={ul}>
            <li>거주 지역</li>
            <li>연령대</li>
            <li>직업 또는 직업군</li>
            <li>관심 분야</li>
            <li>희망 예산</li>
            <li>선호 조건</li>
          </ul>
          <h3 style={h3}>보유·이용 기간</h3>
          <ul style={ul}>
            <li>상담 종료일로부터 1년</li>
            <li>
              별도의 마케팅 활용 동의가 있는 경우에는 해당 동의 유효기간 내 필요한 범위에서 이용
              가능
            </li>
          </ul>
          <h3 style={h3}>동의 거부 권리 및 불이익</h3>
          <ul style={ul}>
            <li>귀하는 본 동의를 거부할 수 있습니다.</li>
            <li>동의하지 않더라도 기본 상담 신청 및 서비스 이용에는 제한이 없습니다.</li>
            <li>다만, 맞춤형 상담 및 추천의 정확도가 낮아질 수 있습니다.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>3. [선택] 제휴상품 마케팅 활용 동의</h2>
          <h3 style={h3}>FEED LIFE 및 제휴상품 마케팅 목적 개인정보 이용 동의</h3>
          <p style={{ margin: "0 0 12px" }}>
            피드백(브랜드명 FEED LIFE)은 고객에게 FEED LIFE 및 제휴사의 상품·서비스를 소개하고 맞춤형
            혜택을 안내하기 위해 개인정보를 마케팅 목적으로 이용합니다.
          </p>
          <h3 style={h3}>이용 목적</h3>
          <ul style={ul}>
            <li>신규 상품 및 서비스 안내</li>
            <li>제휴상품 및 제휴서비스 소개·추천</li>
            <li>이벤트, 할인 및 프로모션 안내</li>
            <li>제휴상품 상담 및 추천</li>
            <li>고객 관심도 분석</li>
            <li>상담·신청 이력에 기반한 맞춤형 안내</li>
          </ul>
          <h3 style={h3}>이용 항목</h3>
          <ul style={ul}>
            <li>성명</li>
            <li>휴대전화번호</li>
            <li>거주 지역</li>
            <li>연령대</li>
            <li>직업 또는 직업군</li>
            <li>관심 분야</li>
            <li>문의·상담·신청 이력</li>
            <li>광고 반응 이력</li>
          </ul>
          <h3 style={h3}>마케팅 대상 상품 및 서비스</h3>
          <ul style={ul}>
            <li>상조</li>
            <li>여행·숙박</li>
            <li>모빌리티·렌터카</li>
            <li>가전·생활서비스</li>
            <li>건강·라이프케어</li>
            <li>교육</li>
            <li>통신</li>
            <li>쇼핑</li>
            <li>기타 생활 관련 FEED LIFE 및 제휴상품</li>
          </ul>
          <h3 style={h3}>마케팅 안내 주체</h3>
          <ul style={ul}>
            <li>피드백(브랜드명 FEED LIFE)</li>
            <li>
              제휴상품을 안내하는 경우 실제 제휴사의 회사명과 상품명을 밝힌 후 FEED LIFE가 직접
              안내합니다.
            </li>
          </ul>
          <h3 style={h3}>제3자 제공 관련 안내</h3>
          <ul style={ul}>
            <li>본 동의만으로 고객의 개인정보를 제휴사 또는 광고주에게 제공하지 않습니다.</li>
            <li>
              제휴사 또는 광고주가 고객에게 직접 연락하기 위해 개인정보 제공이 필요한 경우에는
              제공받는 회사명, 제공 목적, 제공 항목, 보유기간 등을 별도로 안내하고 개인정보 제3자
              제공 동의를 받습니다.
            </li>
          </ul>
          <h3 style={h3}>보유·이용 기간</h3>
          <ul style={ul}>
            <li>동의일로부터 5년 또는 동의 철회 시까지 중 먼저 도래하는 시점</li>
          </ul>
          <h3 style={h3}>동의 거부 및 철회</h3>
          <ul style={ul}>
            <li>귀하는 본 동의를 거부하거나 언제든지 철회할 수 있습니다.</li>
            <li>동의를 거부하거나 철회하더라도 기본 상담 서비스 이용에는 제한이 없습니다.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>4. [선택] 광고성 정보 수신 동의</h2>
          <h3 style={h3}>광고성 정보 수신 동의</h3>
          <p style={{ margin: "0 0 12px" }}>
            피드백(브랜드명 FEED LIFE)으로부터 FEED LIFE 및 제휴사의 상품·서비스, 이벤트, 할인 및
            프로모션 등에 관한 광고성 정보를 수신하는 것에 동의합니다.
          </p>
          <h3 style={h3}>광고성 정보 내용</h3>
          <ul style={ul}>
            <li>FEED LIFE 상품 및 서비스 안내</li>
            <li>제휴상품 및 제휴서비스 안내</li>
            <li>신규 상품 안내</li>
            <li>이벤트 및 프로모션</li>
            <li>할인 및 혜택 정보</li>
          </ul>
          <h3 style={h3}>수신 채널</h3>
          <ul style={ul}>
            <li>전화(TM)</li>
            <li>문자(SMS/LMS)</li>
            <li>카카오톡</li>
            <li>이메일</li>
          </ul>
          <p style={{ margin: "0 0 12px" }}>각 채널별로 개별 선택할 수 있습니다.</p>
          <h3 style={h3}>유효 기간</h3>
          <ul style={ul}>
            <li>동의일로부터 5년 또는 수신동의 철회 시까지</li>
          </ul>
          <h3 style={h3}>수신 동의 거부 및 철회</h3>
          <ul style={ul}>
            <li>
              광고성 정보 수신에 동의하지 않더라도 기본 상담 및 서비스 이용에는 제한이 없습니다.
            </li>
            <li>
              수신 동의 후에도 상담원, 고객센터, 문자 수신거부, 카카오톡 채널 차단 등의 방법으로
              언제든지 철회할 수 있습니다.
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
