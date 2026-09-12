declare module "pinyin-pro/dist/esm/data/dict1.mjs" {
  const characterPinyin: { get(character: string): string | undefined };
  export default characterPinyin;
}

declare module "pinyin-pro/dist/esm/data/surname.mjs" {
  const surnamePinyin: Record<string, string>;
  export default surnamePinyin;
}
