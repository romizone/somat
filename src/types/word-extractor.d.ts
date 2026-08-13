declare module "word-extractor" {
  class WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
  }

  export default class WordExtractor {
    extract(input: Buffer | string): Promise<WordDocument>;
  }
}
