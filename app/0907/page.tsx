import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Compass,
  HeartPulse,
  Home as HomeIcon,
  MessageCircle,
  MoveDown,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import LeadForm from "./LeadForm";
import Landing0907Analytics from "./Landing0907Analytics";

export default function Landing0907() {
  return (
    <div className="landing-0907">
      <Landing0907Analytics />
      <div className="landing-0907-page">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="FEED LIFE 홈">
          <Image src="/assets/0907/feedlife-logo-purple.png" width={1639} height={669} sizes="166px" alt="피드라이프 FEED LIFE" priority />
        </a>
        <div className="header-meta">
          <span>보험영업자를 위한 새로운 고객 접점</span>
          <a className="header-cta" href="#consult">
            상담으로 확인하기 <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <section
        className="hero"
        id="top"
        data-analytics-section="section_01"
        data-analytics-label="1. 히어로"
      >
        <div className="hero-copy">
          <p className="eyebrow"><span>NEW CONTACT</span> 보험은 그대로</p>
          <h1>
            보험은 계속.<br />
            고객을 다시 만날<br />
            <em>이유는 하나 더.</em>
          </h1>
          <p className="hero-description">
            보험을 버리는 제안이 아닙니다. 여행과 건강, 라이프케어라는
            새로운 대화 카드를 더하는 방식입니다.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#consult">
              1분 상담으로 확인하기 <ArrowUpRight size={19} aria-hidden="true" />
            </a>
            <span>지금 바로 활동을 결정할 필요는 없습니다.</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="여행과 건강 라이프케어 이미지">
          <figure className="editorial-card cruise-card">
            <Image src="/assets/0907/sun-cruise.webp" width={1200} height={809} sizes="(max-width: 640px) 82vw, (max-width: 980px) 70vw, 38vw" alt="노을 아래 운항하는 대형 크루즈" priority />
            <figcaption>
              <span>01 / TRAVEL</span>
              <strong>앞으로의 여행을 이야기하는 접점</strong>
            </figcaption>
          </figure>
          <figure className="editorial-card health-card">
            <Image src="/assets/0907/all-life-health.webp" width={720} height={921} sizes="(max-width: 640px) 59vw, (max-width: 980px) 52vw, 29vw" alt="건강 상담을 받는 부부" priority />
            <figcaption>
              <span>02 / HEALTH</span>
              <strong>오늘의 건강을 묻는 접점</strong>
            </figcaption>
          </figure>
          <div className="hero-note">
            <small>CONVERSATION STARTER</small>
            고객과 나눌 이야기가<br />새롭게 넓어집니다
          </div>
        </div>

        <a className="scroll-cue" href="#insight" aria-label="다음 내용 보기">
          <span>SCROLL TO DISCOVER</span>
          <MoveDown size={17} aria-hidden="true" />
        </a>
      </section>

      <section
        className="insight-section"
        id="insight"
        data-analytics-section="section_02"
        data-analytics-label="2. 병목 인사이트"
      >
        <div className="section-number">01</div>
        <div className="insight-copy">
          <p className="section-kicker">THE REAL BOTTLENECK</p>
          <h2>DB도, 교육도, 동행도 했는데.</h2>
          <p className="insight-lead">
            바꿔야 할 건 사람이 아니라<br />
            <strong>고객에게 꺼낼 첫마디</strong>일 수 있습니다.
          </p>
        </div>
        <div className="insight-panel">
          <p>월말마다 “조금만 더 하자”고 말하기 전에,</p>
          <strong>팀원이 고객을 만났을 때 무엇을 이야기할 수 있는지</strong>
          <p>그 시작점부터 다시 살펴봅니다.</p>
        </div>
      </section>

      <section
        className="preview-strip"
        aria-label="새로운 고객 접점 미리보기"
        data-analytics-section="section_03"
        data-analytics-label="3. Before→After"
      >
        <div>
          <span>BEFORE</span>
          <strong>또 보험 이야기</strong>
        </div>
        <div className="shift-mark" aria-hidden="true">→</div>
        <div>
          <span>AFTER</span>
          <strong>여행 · 건강 · 일상 이야기</strong>
        </div>
      </section>

      <section
        className="conversation-section"
        data-analytics-section="section_04"
        data-analytics-label="4. 다음 대화"
      >
        <div className="section-heading">
          <p><span>02</span> THE NEXT CONVERSATION</p>
          <h2>보험을 더 말하기 전에,<br />고객을 다시 만날 <em>이유</em>부터.</h2>
          <span className="heading-caption">상품 하나를 더 얹는 것이 아니라 대화의 출발점을 바꿉니다.</span>
        </div>

        <div className="conversation-board">
          <article className="conversation-card conversation-before">
            <div className="conversation-label">BEFORE</div>
            <MessageCircle size={27} aria-hidden="true" />
            <p>“보험 관련해서<br />잠깐 뵐 수 있을까요?”</p>
            <span>익숙해서 더 어려운 첫마디</span>
          </article>
          <div className="conversation-arrow" aria-hidden="true"><ArrowDownRight size={34} /></div>
          <article className="conversation-card conversation-after">
            <div className="conversation-label">AFTER</div>
            <p>“가족과 꼭 가보고 싶은<br />여행이 있으세요?”</p>
            <p>“건강검사는 언제<br />마지막으로 받아보셨어요?”</p>
            <span>고객의 일상에서 시작되는 대화</span>
          </article>
        </div>
      </section>

      <section
        className="ecosystem-section"
        id="products"
        data-analytics-section="section_05"
        data-analytics-label="5. 라이프케어 상품"
      >
        <div className="section-heading section-heading-light">
          <p><span>03</span> LIFE CARE COLLECTION</p>
          <h2>고객의 내일과 오늘,<br />그리고 일상을 잇습니다.</h2>
          <span className="heading-caption">FEED LIFE가 제안하는 세 가지 라이프케어 접점</span>
        </div>

        <div className="product-grid">
          <article className="product-card product-card-cruise">
            <div className="product-image">
              <Image src="/assets/0907/sun-cruise.webp" width={1200} height={809} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 52vw" alt="프리미엄 크루즈 여행 상품 이미지" />
              <span className="product-index">01</span>
            </div>
            <div className="product-copy">
              <div className="product-icon"><Compass size={21} aria-hidden="true" /></div>
              <p>TY SUN CRUISE</p>
              <h3>앞으로 누리고 싶은<br />여행을 이야기합니다.</h3>
              <span>월 납입으로 준비하는 크루즈 라이프서비스와 프리미엄 가전, 헬스케어 혜택을 함께 살펴볼 수 있습니다.</span>
              <ul>
                <li><Check size={15} /> 선지원형 크루즈 라이프서비스</li>
                <li><Check size={15} /> 프리미엄 가전 · 헬스케어</li>
              </ul>
            </div>
          </article>

          <article className="product-card product-card-health">
            <div className="product-copy">
              <div className="product-icon"><HeartPulse size={21} aria-hidden="true" /></div>
              <p>TY ALL-LIFE CARE</p>
              <h3>오늘의 건강을 묻는<br />자연스러운 시작점.</h3>
              <span>암 위험 신호를 참고하는 스크리닝과 헬스케어 서비스를 통해 건강관리 이야기를 시작합니다.</span>
              <ul>
                <li><Check size={15} /> 유전자 · 종양표지자 통합 리스크 분석</li>
                <li><Check size={15} /> GC케어 기반 헬스케어 서비스</li>
              </ul>
            </div>
            <div className="health-visual-stack">
              <Image className="health-scene" src="/assets/0907/all-life-health.webp" width={720} height={921} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 52vw" alt="부부의 건강 상담 장면" />
              <span className="product-index product-index-health">02</span>
              <figure className="report-card">
                <Image src="/assets/0907/all-life-report.webp" width={800} height={775} sizes="185px" alt="건강 리스크 분석 결과 리포트 예시" />
                <figcaption>SAMPLE REPORT</figcaption>
              </figure>
            </div>
          </article>

          <article className="product-card product-card-home">
            <div className="product-image">
              <Image src="/assets/0907/special-life-home.webp" width={1100} height={423} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 52vw" alt="밝은 거실의 프리미엄 생활가전" />
              <span className="product-index">03</span>
            </div>
            <div className="product-copy">
              <div className="product-icon"><HomeIcon size={21} aria-hidden="true" /></div>
              <p>TY SPECIAL LIFE CARE</p>
              <h3>생활 가까이에서<br />이어지는 라이프케어.</h3>
              <span>프리미엄 가전과 라이프서비스, 헬스케어를 고객의 일상에 맞게 안내할 수 있습니다.</span>
              <ul>
                <li><Check size={15} /> 구좌별 프리미엄 생활가전</li>
                <li><Check size={15} /> 라이프서비스 · 헬스케어</li>
              </ul>
            </div>
          </article>
        </div>
        <p className="product-notice">
          상품 및 서비스의 제공 범위, 선지원·환급·검사·가전 이용 조건은 상품별 청약서와 약관을 기준으로 합니다.
          올라이프 케어 검사는 암 진단이 아닌 위험 신호 확인을 위한 스크리닝입니다.
        </p>
      </section>

      <section
        className="reassurance-section"
        data-analytics-section="section_06"
        data-analytics-label="6. 보험 병행 안심"
      >
        <div className="reassurance-mark"><ShieldCheck size={28} aria-hidden="true" /></div>
        <div className="reassurance-copy">
          <p>ONE MORE CONTACT, NOT A REPLACEMENT</p>
          <h2>보험을 그만두라는<br />말이 아닙니다.</h2>
          <strong>오히려, 오래 지키셨으면 합니다.</strong>
        </div>
        <div className="reassurance-detail">
          <p>
            보험이 필요할 때만 만나는 관계에서<br />
            <b>건강과 여행, 일상까지 함께 이야기하는 관계</b>로.
          </p>
          <div className="continuity-line">
            <span>보험</span><i></i><span>새로운 고객 접점</span><i></i><strong>더 오래 이어지는 관계</strong>
          </div>
        </div>
      </section>

      <section
        className="audience-section"
        data-analytics-section="section_07"
        data-analytics-label="7. 팀/설계사"
      >
        <div className="section-heading">
          <p><span>04</span> FOR YOUR TEAM</p>
          <h2>누구에게나 같은 답 대신,<br /><em>지금 필요한 카드</em>를 더합니다.</h2>
        </div>

        <div className="audience-layout">
          <div className="audience-cards">
            <article className="audience-card">
              <div className="audience-card-top"><UsersRound size={23} /><span>MANAGER</span></div>
              <h3>관리자에게</h3>
              <p>팀원을 더 압박하기 전에, 고객과 다시 이야기할 수 있는 시작점을 함께 설계합니다.</p>
              <ul>
                <li>팀 적용 방식 안내</li>
                <li>상품별 대화 주제 정리</li>
                <li>보험 병행을 고려한 구조</li>
              </ul>
            </article>
            <article className="audience-card">
              <div className="audience-card-top"><MessageCircle size={23} /><span>PLANNER</span></div>
              <h3>설계사에게</h3>
              <p>이미 쌓아온 고객 관계는 그대로 두고, 안부를 물을 새로운 이유를 넓힙니다.</p>
              <ul>
                <li>기존 고객 관계 유지</li>
                <li>여행 · 건강 · 일상 대화</li>
                <li>내 속도에 맞춘 상담</li>
              </ul>
            </article>
          </div>

          <aside className="mascot-panel">
            <div className="mascot-copy">
              <span className="mascot-kicker">FEED LIFE NOTE</span>
              <strong>압박은 덜고,<br /><em>꺼낼 카드는 더하고.</em></strong>
              <p>보험은 이어가면서, 고객과 나눌 여행·건강·일상 이야기를 넓혀보세요.</p>
              <span className="mascot-note">고객의 일상에서 다시 만나는 방법</span>
            </div>
            <div className="mascot-visual">
              <Image src="/assets/0907/feedlife-beaver.jpg" fill sizes="(max-width: 640px) 100vw, 48vw" alt="보라색 모자를 쓴 FEED LIFE 비버 캐릭터가 나뭇가지로 하트를 만드는 모습" />
            </div>
          </aside>
        </div>
      </section>

      <section
        className="process-section"
        data-analytics-section="section_08"
        data-analytics-label="8. 진행 절차"
      >
        <div className="process-intro">
          <p>HOW IT STARTS</p>
          <h2>시작은 가볍게.<br />확인은 분명하게.</h2>
          <span>상담 후 바로 활동을 결정하지 않아도 됩니다.</span>
        </div>
        <ol className="process-list">
          <li>
            <span>01</span>
            <div><strong>1분 상담 신청</strong><p>연락 가능한 시간과 현재 역할만 남겨주세요.</p></div>
          </li>
          <li>
            <span>02</span>
            <div><strong>내 상황에 맞는 안내</strong><p>상품 구조와 고객 대화 방식, 팀 적용 방법을 확인합니다.</p></div>
          </li>
          <li>
            <span>03</span>
            <div><strong>시작 여부 결정</strong><p>충분히 들어본 뒤 내게 맞는지 판단하시면 됩니다.</p></div>
          </li>
        </ol>
      </section>

      <section
        className="faq-section"
        data-analytics-section="section_09"
        data-analytics-label="9. FAQ"
      >
        <div className="faq-heading">
          <p>FAQ</p>
          <h2>먼저 궁금한 것부터<br />확인해 보세요.</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>보험 일을 그만둬야 하나요?<span>+</span></summary>
            <p>아닙니다. 기존 보험 활동을 대체하라는 제안이 아니라, 고객과 대화할 수 있는 라이프케어 접점을 함께 살펴보는 안내입니다.</p>
          </details>
          <details>
            <summary>상담을 받으면 바로 시작해야 하나요?<span>+</span></summary>
            <p>아닙니다. 상품 구조와 활동 방식을 충분히 확인한 뒤 본인 또는 팀에 맞는지 결정하시면 됩니다.</p>
          </details>
          <details>
            <summary>관리자와 설계사 모두 상담할 수 있나요?<span>+</span></summary>
            <p>네. 조직 적용이 궁금한 관리자와 새로운 고객 대화가 필요한 현업 설계사 모두 상황에 맞게 안내받을 수 있습니다.</p>
          </details>
          <details>
            <summary>상품의 자세한 조건은 어디서 확인하나요?<span>+</span></summary>
            <p>상담 시 최신 상품 안내자료를 기준으로 납입, 서비스, 선지원, 환급, 검사와 가전 제공 조건을 자세히 설명드립니다.</p>
          </details>
        </div>
      </section>

      <section
        className="consult-section"
        id="consult"
        data-analytics-section="section_10"
        data-analytics-label="10. 상담 신청"
      >
        <div className="consult-copy">
          <p>LET&apos;S TALK</p>
          <h2>보험은 지키고,<br />고객 접점은 넓히고.</h2>
          <span>우리 팀에 어떻게 붙일 수 있는지,<br />또는 내 고객에게 어떤 첫마디가 가능한지<br />상담으로 먼저 확인해 보세요.</span>
          <div className="consult-promise">
            <ShieldCheck size={22} aria-hidden="true" />
            <p><strong>부담 없는 안내</strong>활동을 강요하지 않고 필요한 내용부터 설명합니다.</p>
          </div>
        </div>
        <LeadForm />
      </section>

      <footer
        data-analytics-section="section_11"
        data-analytics-label="11. 푸터"
      >
        <Image
          src="/assets/0907/feedlife-logo-purple.png"
          width={145}
          height={59}
          sizes="145px"
          alt="피드라이프 FEED LIFE"
        />
        <p>본 페이지는 상품 및 파트너 활동에 대한 이해를 돕기 위한 요약 안내입니다. 실제 제공 서비스와 세부 조건은 최신 상품별 청약서·약관 및 공식 안내자료를 기준으로 합니다. 소득이나 영업 성과를 보장하지 않습니다.</p>
        <span>© FEED LIFE. ALL RIGHTS RESERVED.</span>
      </footer>

      <a className="mobile-sticky-cta" href="#consult">1분 상담으로 확인하기 <ArrowUpRight size={18} /></a>
      </div>
    </div>
  );
}
