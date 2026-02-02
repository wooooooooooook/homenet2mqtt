declare module 'aromanize' {
  interface AromanizeModule {
    romanize(text: string, system?: 'rr-translit' | 'mr' | string): string;
  }

  const Aromanize: AromanizeModule;
  export default Aromanize;
}
