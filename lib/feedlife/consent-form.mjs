import { CONSENT_COPY, CONSENT_VERSION, FORM_OPTIONS, MARKETING_DEFAULT } from './consent-config.mjs';
import { OPERATOR } from './operator-config.mjs';

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const options = (key) => `<option value="">선택하지 않음</option>${FORM_OPTIONS[key].map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('')}`;
const paragraphs = (lines) => lines.map(line => `<p>${escapeHTML(line)}</p>`).join('');

/**
 * 기존 공통 팝업 리스너를 제거한 뒤 1회만 설치합니다.
 * onSubmit 미지정 = 전송 없는 개발자 전달 모드. 성공으로 가장하지 않습니다.
 * onSubmit(payload) => Promise<{ok:true, submissionId:string}> 는 실제 서버 저장 완료 후 반환해야 합니다.
 */
export function installConsentForm({ onSubmit = null, privacyHref = './privacy.html', marketing = MARKETING_DEFAULT, root = document, listenForCustomEvent = true } = {}) {
  if (document.getElementById('fl-consent-dialog')) throw new Error('상담폼은 한 번만 설치하세요.');
  const pageFooter = root.querySelector('main > footer');
  if (pageFooter && !pageFooter.querySelector('[data-fl-operator-info]')) {
    const companyInfo = document.createElement('p');
    companyInfo.dataset.flOperatorInfo = '';
    companyInfo.className = 'fl-operator-info';
    companyInfo.textContent = `${OPERATOR.company} · 대표 ${OPERATOR.representative} · 사업자등록번호 ${OPERATOR.businessRegistrationNumber}\n${OPERATOR.postalAddress}\n개인정보 문의: ${OPERATOR.department} · ${OPERATOR.phone} · ${OPERATOR.email}`;
    pageFooter.append(companyInfo);
  }
  const marketingReady = marketing.enabled === true && ['version','useStatement','receiveStatement','retentionDescription','withdrawalContact'].every(k => typeof marketing[k] === 'string' && marketing[k].trim()) && Array.isArray(marketing.fields) && marketing.fields.length === 2 && marketing.fields.includes('name') && marketing.fields.includes('phone');
  if (marketing.enabled && !marketingReady) throw new Error('마케팅 활성화 전 목적·항목·보유기간·철회방법·문안 버전을 확정하세요.');
  const dialog = document.createElement('dialog');
  dialog.id = 'fl-consent-dialog';
  dialog.className = 'fl-consent';
  dialog.setAttribute('aria-labelledby', 'fl-title');
  dialog.innerHTML = `
    <div class="fl-header"><div><span class="fl-kicker">FEED LIFE PARTNER</span><h2 id="fl-title">파트너 상담 신청</h2></div><button type="button" class="fl-close" aria-label="상담창 닫기"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    <div class="fl-scroll">
    <p class="fl-intro">이름·연락처·지역만으로 상담을 신청할 수 있습니다.<br>${marketingReady ? '추가정보와 광고 수신 동의는 선택입니다.' : '추가정보 동의는 선택이며, 신청한 상담에 필요한 연락만 드립니다.'}</p>
    <form id="fl-form" novalidate>
      <fieldset class="fl-fields"><legend>01 기본 상담 정보</legend>
        <label for="fl-name">이름 <span class="fl-required">필수</span><input id="fl-name" name="name" autocomplete="name" placeholder="한글 2~10자" maxlength="10" required pattern="[가-힣]{2,10}"></label>
        <label for="fl-phone">휴대전화번호 <span class="fl-required">필수</span><input id="fl-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" maxlength="13" required></label>
        <label for="fl-region">지역 <span class="fl-required">필수</span><select id="fl-region" name="region" required>${options('region').replace('선택하지 않음','지역 선택')}</select></label>
        <label for="fl-time">상담가능시간 <span class="fl-optional">선택</span><select id="fl-time" name="consultationTime">${options('consultationTime')}</select></label>
      </fieldset>
      <section class="fl-consent-section" aria-label="상담 동의">
        <div class="fl-consent-item"><label class="fl-check" for="fl-required"><input id="fl-required" name="requiredPrivacy" type="checkbox" required><span>${CONSENT_COPY.requiredTitle}</span></label><details open><summary>수집 항목·목적·보유기간 확인</summary><div class="fl-terms">${paragraphs(CONSENT_COPY.required)}</div></details></div>
        <div class="fl-consent-item"><label class="fl-check" for="fl-optional"><input id="fl-optional" name="optionalConsultation" type="checkbox"><span>${CONSENT_COPY.optionalTitle}</span></label><p class="fl-hint">동의하지 않아도 기본 상담에는 불이익이 없습니다.</p><details><summary>맞춤 상담 동의 내용 확인</summary><div class="fl-terms">${paragraphs(CONSENT_COPY.optional)}</div></details>
          <fieldset id="fl-extra" class="fl-fields fl-extra" disabled><legend>동의한 경우에만 입력 가능 · 각 항목 선택</legend>
            <label for="fl-age">연령대 <span class="fl-optional">선택</span><select id="fl-age" name="ageBand">${options('ageBand')}</select></label>
            <label for="fl-role">현재 역할 <span class="fl-optional">선택</span><select id="fl-role" name="currentRole">${options('currentRole')}</select></label>
          </fieldset>
          <p id="fl-extra-status" class="fl-hint" aria-live="polite">맞춤 상담에 동의하지 않으면 연령대·현재 역할을 수집하지 않습니다.</p>
        </div>
      </section>
      ${marketingReady ? `
      <section class="fl-consent-section" aria-label="선택 마케팅 동의">
        <div class="fl-consent-item"><label class="fl-check" for="fl-marketing"><input id="fl-marketing" name="marketingUse" type="checkbox"><span>[선택] FEED LIFE 및 제휴상품 마케팅을 위한 개인정보 이용 동의</span></label>
        <details><summary>마케팅 이용 동의 내용 확인</summary><div class="fl-terms">${paragraphs([marketing.useStatement,'이용 항목: 성명, 휴대전화번호',`보유·이용 기간: ${marketing.retentionDescription}`,`철회 방법: ${marketing.withdrawalContact}`,'동의하지 않아도 기본 상담 신청 및 진행에 불이익이 없습니다. 본 동의만으로 개인정보가 제휴사에 제공되거나 제휴사의 직접 연락에 동의한 것으로 처리하지 않습니다.'])}</div></details>
        <fieldset id="fl-channels" class="fl-channels" disabled><legend>[선택] 광고성 정보 수신 채널</legend><p>${escapeHTML(marketing.receiveStatement)}</p><p>수신할 채널을 각각 선택해 주세요. 선택하지 않은 채널로는 발송하지 않습니다.</p>
        <label class="fl-check"><input name="channelPhone" type="checkbox">전화</label><label class="fl-check"><input name="channelSms" type="checkbox">문자</label><label class="fl-check"><input name="channelKakao" type="checkbox">카카오톡</label></fieldset>
        </div>
      </section>` : '<p class="fl-hint fl-marketing-off">별도의 광고성 정보 수신 동의를 받지 않습니다. 상담 신청에 필요한 연락만 안내합니다.</p>'}
      <p class="fl-privacy-link"><a href="${escapeHTML(privacyHref)}" target="_blank" rel="noopener">파트너 상담 개인정보 수집·이용 안내 ↗</a></p>
      <p class="fl-hint">개인정보 문의·동의 철회: ${escapeHTML(OPERATOR.department)}<br><a href="tel:${escapeHTML(OPERATOR.phone)}">${escapeHTML(OPERATOR.phone)}</a> · <a href="mailto:${escapeHTML(OPERATOR.email)}">${escapeHTML(OPERATOR.email)}</a></p>
      <div id="fl-errors" class="fl-errors" role="alert" tabindex="-1" hidden></div>
      <button type="submit" class="fl-submit">상담 신청하기</button>
      <p class="fl-footnote">필수 동의만으로 신청할 수 있습니다. 모든 동의는 미선택 상태에서 시작합니다.</p>
    </form>
    <div id="fl-result" class="fl-result" role="status" tabindex="-1" hidden></div>
    </div>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const controls = form.elements;
  const errorBox = dialog.querySelector('#fl-errors');
  const result = dialog.querySelector('#fl-result');
  let opener = null;
  let busy = false;
  let scrollLock = '';

  function resetAdditional() {
    const opted = controls.optionalConsultation.checked;
    dialog.querySelector('#fl-extra').disabled = !opted;
    if (!opted) { controls.ageBand.value = ''; controls.currentRole.value = ''; }
    dialog.querySelector('#fl-extra-status').textContent = opted ? '필요한 항목만 선택해 주세요. 두 항목 모두 비워도 신청할 수 있습니다.' : '맞춤 상담에 동의하지 않으면 연령대·현재 역할을 수집하지 않습니다.';
  }
  function resetMarketing() {
    if (!marketingReady) return;
    const opted = controls.marketingUse.checked;
    dialog.querySelector('#fl-channels').disabled = !opted;
    if (!opted) ['channelPhone','channelSms','channelKakao'].forEach(k => controls[k].checked = false);
  }
  function showErrors(errors) {
    errorBox.replaceChildren();
    for (const error of errors) { const p = document.createElement('p'); p.textContent = error.message; errorBox.append(p); }
    errorBox.hidden = false;
    errorBox.focus();
  }
  function open(trigger) {
    if (dialog.open) return;
    opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    form.reset(); resetAdditional(); resetMarketing();
    form.hidden = false; result.hidden = true; result.textContent = ''; errorBox.hidden = true;
    scrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('.fl-scroll').scrollTop = 0;
    controls.name.focus();
  }
  function close() { if (!busy) dialog.close(); }
  dialog.querySelector('.fl-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    form.reset(); resetAdditional(); resetMarketing();
    document.body.style.overflow = scrollLock;
    if (opener?.isConnected) opener.focus();
  });
  controls.optionalConsultation.addEventListener('change', resetAdditional);
  controls.marketingUse?.addEventListener('change', resetMarketing);
  function onClick(event) {
    const trigger = event.target.closest?.('[data-feedlife-consult]');
    if (!trigger || !root.contains(trigger)) return;
    event.preventDefault(); open(trigger);
  }
  function onConsult(event) { event.preventDefault(); open(document.activeElement); }
  root.addEventListener('click', onClick);
  if (listenForCustomEvent) window.addEventListener('feedlife:consult', onConsult);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    result.hidden = true;
    errorBox.hidden = true;
    const name = controls.name.value.trim();
    const phone = controls.phone.value.replace(/[\s-]/g, '');
    const errors = [];
    if (!/^[가-힣]{2,10}$/.test(name)) errors.push({field:'name',message:'이름을 한글 2~10자로 입력해 주세요.'});
    if (!/^010\d{8}$/.test(phone)) errors.push({field:'phone',message:'010으로 시작하는 휴대전화번호 11자리를 입력해 주세요.'});
    if (!FORM_OPTIONS.region.includes(controls.region.value)) errors.push({field:'region',message:'지역을 선택해 주세요.'});
    if (!controls.requiredPrivacy.checked) errors.push({field:'requiredPrivacy',message:'상담에 필요한 필수 개인정보 수집·이용에 동의해 주세요.'});
    if (errors.length) return showErrors(errors);
    const extra = controls.optionalConsultation.checked;
    const useMarketing = marketingReady && controls.marketingUse.checked;
    const payload = {
      consentVersion: CONSENT_VERSION, ...(useMarketing ? {marketingVersion:marketing.version} : {}), name, phone, region: controls.region.value,
      ...(controls.consultationTime.value ? {consultationTime: controls.consultationTime.value} : {}),
      ...(extra && controls.ageBand.value ? {ageBand:controls.ageBand.value} : {}),
      ...(extra && controls.currentRole.value ? {currentRole:controls.currentRole.value} : {}),
      consent: {
        requiredPrivacy:true, optionalConsultation:extra, marketingUse:useMarketing,
        channels:{phone:useMarketing && controls.channelPhone.checked, sms:useMarketing && controls.channelSms.checked, kakao:useMarketing && controls.channelKakao.checked},
      },
    };
    if (!onSubmit) {
      result.textContent = '현재 온라인 상담 신청을 이용할 수 없습니다. 입력한 정보는 접수되지 않았습니다. 010-6445-9312로 문의해 주세요.';
      result.hidden = false; result.focus(); return;
    }
    busy = true;
    const submit = dialog.querySelector('.fl-submit');
    const closeButton = dialog.querySelector('.fl-close');
    // 전송 중 체크 상태가 바뀌어 화면과 저장된 동의가 달라지지 않도록 잠급니다.
    const disabledStates = [...form.querySelectorAll('input,select,button')].map(control => [control, control.disabled]);
    disabledStates.forEach(([control]) => control.disabled = true);
    closeButton.disabled = true; form.setAttribute('aria-busy','true');
    const previousLabel = submit.textContent; submit.textContent = '접수 확인 중…';
    try {
      const response = await onSubmit(payload);
      if (response?.ok !== true || typeof response.submissionId !== 'string' || !response.submissionId.trim()) throw new Error('접수 완료 확인을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
      form.reset(); resetAdditional(); resetMarketing(); form.hidden = true;
      result.textContent = '상담 신청이 접수되었습니다. 담당자가 신청하신 연락처로 안내드리겠습니다.';
      result.hidden = false; result.focus();
    } catch (error) {
      showErrors(Array.isArray(error.errors) ? error.errors : [{message:'접수 완료를 확인하지 못했습니다. 입력은 유지되어 있습니다. 잠시 후 다시 시도해 주세요.'}]);
    } finally {
      busy = false; disabledStates.forEach(([control,disabled]) => control.disabled = disabled);
      resetAdditional(); resetMarketing(); closeButton.disabled = false; submit.textContent = previousLabel; form.removeAttribute('aria-busy');
    }
  });
  return {
    open, close,
    destroy() { if (dialog.open) dialog.close(); document.body.style.overflow = scrollLock; root.removeEventListener('click',onClick); if(listenForCustomEvent) window.removeEventListener('feedlife:consult',onConsult); dialog.remove(); },
  };
}
