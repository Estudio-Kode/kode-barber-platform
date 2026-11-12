export const PASSWORD_REQUIREMENTS =
  "Pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial.";

export function isStrongPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[\p{P}\p{S}]/u.test(value)
  );
}
