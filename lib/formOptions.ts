/** 희망 상담시간 옵션 */
export const DESIRED_TIME_OPTIONS = [
  { value: "", label: "선택하세요" },
  { value: "오전 09:00~12:00", label: "오전 09:00~12:00" },
  { value: "오후 12:00~15:00", label: "오후 12:00~15:00" },
  { value: "오후 15:00~18:00", label: "오후 15:00~18:00" },
  { value: "저녁 18:00~21:00", label: "저녁 18:00~21:00" },
];

/** 사는 위치 옵션 */
export const LOCATION_OPTIONS = [
  { value: "", label: "선택하세요" },
  { value: "서울특별시", label: "서울특별시" },
  { value: "부산광역시", label: "부산광역시" },
  { value: "대구광역시", label: "대구광역시" },
  { value: "인천광역시", label: "인천광역시" },
  { value: "광주광역시", label: "광주광역시" },
  { value: "대전광역시", label: "대전광역시" },
  { value: "울산광역시", label: "울산광역시" },
  { value: "세종특별자치시", label: "세종특별자치시" },
  { value: "경기도", label: "경기도" },
  { value: "강원특별자치도", label: "강원특별자치도" },
  { value: "충청북도", label: "충청북도" },
  { value: "충청남도", label: "충청남도" },
  { value: "전라북도", label: "전라북도" },
  { value: "전라남도", label: "전라남도" },
  { value: "경상북도", label: "경상북도" },
  { value: "경상남도", label: "경상남도" },
  { value: "제주특별자치도", label: "제주특별자치도" },
];

/** 오늘 기준으로 선택 가능한 희망 상담일 옵션 생성 (오늘~14일 후) */
export function getDesiredDateOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: "", label: "선택하세요" }];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const value = `${y}-${m}-${day}`;
    const label = i === 0 ? "오늘" : i === 1 ? "내일" : `${m}/${day}`;
    options.push({ value, label });
  }
  return options;
}
