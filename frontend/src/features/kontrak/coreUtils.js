export function coreInputValue(value) {
  if (value == null || value === "") return "";
  return String(value).replace(/\s*core\s*$/i, "").trim();
}

export function coreInputError(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Core wajib diisi jika tidak menggunakan Sharing Core";
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    return "Core harus berupa angka bulat minimal 1";
  }
  return null;
}

export function coreDisplayValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /\s+core$/i.test(raw) ? raw : `${raw} Core`;
}
