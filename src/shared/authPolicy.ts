export const VAULT_PASSWORD_MIN_LENGTH = 8;

export const VAULT_PASSWORD_MIN_LENGTH_MESSAGE =
  `Password must be at least ${VAULT_PASSWORD_MIN_LENGTH} characters.`;

export const isVaultPasswordLongEnough = (password: string): boolean =>
  password.length >= VAULT_PASSWORD_MIN_LENGTH;
