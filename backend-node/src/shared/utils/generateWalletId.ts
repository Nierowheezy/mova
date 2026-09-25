export const generateWalletId = (): string => {
  // Generate a 10-digit wallet ID (matching Django's uuid.uuid4().int[:10])
  return Math.floor(Math.random() * 9000000000 + 1000000000).toString();
};
