import { describe, it, expect, beforeEach } from "vitest";
import { bufferCV, stringUtf8CV, uintCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_TITLE = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_CATEGORY = 104;
const ERR_INVALID_TAGS = 105;
const ERR_INVALID_PRICE = 106;
const ERR_INVALID_ROYALTY_RATE = 107;
const ERR_CONTENT_ALREADY_EXISTS = 110;
const ERR_CONTENT_NOT_FOUND = 111;
const ERR_MAX_CONTENTS_EXCEEDED = 112;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_AUTHORITY_NOT_VERIFIED = 109;
const ERR_INVALID_MAX_CONTENTS = 115;
const ERR_INVALID_REGISTRATION_FEE = 116;
const ERR_TOO_MANY_TAGS = 119;
const ERR_TAG_TOO_LONG = 118;
const ERR_INVALID_CURRENCY = 120;

interface Content {
  hash: Uint8Array;
  title: string;
  description: string;
  creator: string;
  timestamp: number;
  category: string;
  tags: string[];
  price: number;
  royaltyRate: number;
  currency: string;
  status: boolean;
}

interface ContentUpdate {
  updateTitle: string;
  updateDescription: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ContentRegistryMock {
  state: {
    nextContentId: number;
    maxContents: number;
    registrationFee: number;
    authorityContract: string | null;
    contents: Map<number, Content>;
    contentUpdates: Map<number, ContentUpdate>;
    contentsByHash: Map<string, number>;
  } = {
    nextContentId: 0,
    maxContents: 100000,
    registrationFee: 100,
    authorityContract: null,
    contents: new Map(),
    contentUpdates: new Map(),
    contentsByHash: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextContentId: 0,
      maxContents: 100000,
      registrationFee: 100,
      authorityContract: null,
      contents: new Map(),
      contentUpdates: new Map(),
      contentsByHash: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxContents(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxContents = newMax;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerContent(
    hash: Uint8Array,
    title: string,
    description: string,
    category: string,
    tags: string[],
    price: number,
    royaltyRate: number,
    currency: string
  ): Result<number> {
    if (this.state.nextContentId >= this.state.maxContents) return { ok: false, value: ERR_MAX_CONTENTS_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!title || title.length > 256) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 1024) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!category || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (tags.length > 10) return { ok: false, value: ERR_TOO_MANY_TAGS };
    if (tags.some(tag => tag.length > 50)) return { ok: false, value: ERR_TAG_TOO_LONG };
    if (price < 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (royaltyRate > 100) return { ok: false, value: ERR_INVALID_ROYALTY_RATE };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    const hashKey = Buffer.from(hash).toString('hex');
    if (this.state.contentsByHash.has(hashKey)) return { ok: false, value: ERR_CONTENT_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextContentId;
    const content: Content = {
      hash,
      title,
      description,
      creator: this.caller,
      timestamp: this.blockHeight,
      category,
      tags,
      price,
      royaltyRate,
      currency,
      status: true,
    };
    this.state.contents.set(id, content);
    this.state.contentsByHash.set(hashKey, id);
    this.state.nextContentId++;
    return { ok: true, value: id };
  }

  getContent(id: number): Content | null {
    return this.state.contents.get(id) || null;
  }

  updateContent(id: number, updateTitle: string, updateDescription: string): Result<boolean> {
    const content = this.state.contents.get(id);
    if (!content) return { ok: false, value: false };
    if (content.creator !== this.caller) return { ok: false, value: false };
    if (!updateTitle || updateTitle.length > 256) return { ok: false, value: false };
    if (updateDescription.length > 1024) return { ok: false, value: false };

    const updated: Content = {
      ...content,
      title: updateTitle,
      description: updateDescription,
      timestamp: this.blockHeight,
    };
    this.state.contents.set(id, updated);
    this.state.contentUpdates.set(id, {
      updateTitle,
      updateDescription,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getContentCount(): Result<number> {
    return { ok: true, value: this.state.nextContentId };
  }

  verifyOwnership(hash: Uint8Array, claimedCreator: string): Result<boolean> {
    const hashKey = Buffer.from(hash).toString('hex');
    const id = this.state.contentsByHash.get(hashKey);
    if (id === undefined) return { ok: true, value: false };
    const content = this.state.contents.get(id);
    if (!content) return { ok: true, value: false };
    return { ok: true, value: content.creator === claimedCreator };
  }
}

describe("ContentRegistry", () => {
  let contract: ContentRegistryMock;

  beforeEach(() => {
    contract = new ContentRegistryMock();
    contract.reset();
  });

  it("registers content successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerContent(
      hash,
      "Title",
      "Description",
      "Category",
      ["tag1", "tag2"],
      100,
      10,
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const content = contract.getContent(0);
    expect(content?.title).toBe("Title");
    expect(content?.description).toBe("Description");
    expect(content?.category).toBe("Category");
    expect(content?.tags).toEqual(["tag1", "tag2"]);
    expect(content?.price).toBe(100);
    expect(content?.royaltyRate).toBe(10);
    expect(content?.currency).toBe("STX");
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate content hashes", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerContent(
      hash,
      "Title1",
      "Desc1",
      "Cat1",
      ["tag1"],
      100,
      10,
      "STX"
    );
    const result = contract.registerContent(
      hash,
      "Title2",
      "Desc2",
      "Cat2",
      ["tag2"],
      200,
      20,
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONTENT_ALREADY_EXISTS);
  });

  it("rejects registration without authority contract", () => {
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerContent(
      hash,
      "Title",
      "Description",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(31).fill(1);
    const result = contract.registerContent(
      hash,
      "Title",
      "Description",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid title", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerContent(
      hash,
      "",
      "Description",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects too many tags", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const tags = Array(11).fill("tag");
    const result = contract.registerContent(
      hash,
      "Title",
      "Description",
      "Category",
      tags,
      100,
      10,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOO_MANY_TAGS);
  });

  it("rejects tag too long", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const tags = ["a".repeat(51)];
    const result = contract.registerContent(
      hash,
      "Title",
      "Description",
      "Category",
      tags,
      100,
      10,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TAG_TOO_LONG);
  });

  it("updates content successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerContent(
      hash,
      "OldTitle",
      "OldDesc",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    const result = contract.updateContent(0, "NewTitle", "NewDesc");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const content = contract.getContent(0);
    expect(content?.title).toBe("NewTitle");
    expect(content?.description).toBe("NewDesc");
    const update = contract.state.contentUpdates.get(0);
    expect(update?.updateTitle).toBe("NewTitle");
    expect(update?.updateDescription).toBe("NewDesc");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent content", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateContent(99, "NewTitle", "NewDesc");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerContent(
      hash,
      "Title",
      "Desc",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateContent(0, "NewTitle", "NewDesc");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(200);
    const hash = new Uint8Array(32).fill(1);
    contract.registerContent(
      hash,
      "Title",
      "Desc",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 200, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("returns correct content count", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash1 = new Uint8Array(32).fill(1);
    const hash2 = new Uint8Array(32).fill(2);
    contract.registerContent(
      hash1,
      "Title1",
      "Desc1",
      "Cat1",
      ["tag1"],
      100,
      10,
      "STX"
    );
    contract.registerContent(
      hash2,
      "Title2",
      "Desc2",
      "Cat2",
      ["tag2"],
      200,
      20,
      "USD"
    );
    const result = contract.getContentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("verifies ownership correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerContent(
      hash,
      "Title",
      "Desc",
      "Category",
      ["tag1"],
      100,
      10,
      "STX"
    );
    const result = contract.verifyOwnership(hash, "ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.verifyOwnership(hash, "ST3FAKE");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });
  
  it("rejects registration with max contents exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxContents = 1;
    const hash1 = new Uint8Array(32).fill(1);
    contract.registerContent(
      hash1,
      "Title1",
      "Desc1",
      "Cat1",
      ["tag1"],
      100,
      10,
      "STX"
    );
    const hash2 = new Uint8Array(32).fill(2);
    const result = contract.registerContent(
      hash2,
      "Title2",
      "Desc2",
      "Cat2",
      ["tag2"],
      200,
      20,
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CONTENTS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});