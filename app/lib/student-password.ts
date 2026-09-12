import characterPinyin from "pinyin-pro/dist/esm/data/dict1.mjs";
import surnamePinyin from "pinyin-pro/dist/esm/data/surname.mjs";

function withoutTone(value: string) {
  return value
    .replace(/[ǖǘǚǜü]/g, "v")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function firstPronunciation(character: string) {
  return withoutTone(characterPinyin.get(character)?.split(" ")[0] || character);
}

/**
 * 批量建号时使用姓名全拼作为初始密码。
 * 统一为小写 ASCII 且移除空格、连字符等分隔符，方便学生直接输入。
 */
export function studentNamePassword(name: string) {
  const trimmed = name.trim();
  const compoundSurname = Object.keys(surnamePinyin).find((surname) => surname.length > 1 && trimmed.startsWith(surname));
  const surname = compoundSurname || trimmed[0] || "";
  const surnameSpelling = surnamePinyin[surname] ? withoutTone(surnamePinyin[surname]) : firstPronunciation(surname);
  const givenName = [...trimmed.slice(surname.length)].map(firstPronunciation).join("");
  const spelling = `${surnameSpelling}${givenName}`.replace(/[^a-z0-9]/g, "");
  return spelling || trimmed.toLowerCase().replace(/\s+/g, "");
}
