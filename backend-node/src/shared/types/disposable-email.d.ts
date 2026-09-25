declare module "is-disposable-email" {
  function isDisposableEmail(email: string): Promise<boolean>;
  export = isDisposableEmail;
}
