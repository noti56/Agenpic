import PocketBase, { BaseAuthStore, type RecordModel } from "pocketbase";
import type {
  CommentRecord,
  DocRecord,
  MessageRecord,
  ProjectMemberRecord,
  ProjectRecord,
  TicketRecord,
  UserRecord,
} from "@agenpic/types";

export class AgenpicClient {
  readonly pb: PocketBase;

  constructor(url: string, authStore?: BaseAuthStore) {
    this.pb = new PocketBase(url, authStore);
  }

  get users() {
    return this.pb.collection<UserRecord & RecordModel>("users");
  }

  get projects() {
    return this.pb.collection<ProjectRecord & RecordModel>("projects");
  }

  get projectMembers() {
    return this.pb.collection<ProjectMemberRecord & RecordModel>("project_members");
  }

  get tickets() {
    return this.pb.collection<TicketRecord & RecordModel>("tickets");
  }

  get messages() {
    return this.pb.collection<MessageRecord & RecordModel>("messages");
  }

  get ticketComments() {
    return this.pb.collection<CommentRecord & RecordModel>("ticket_comments");
  }

  get docs() {
    return this.pb.collection<DocRecord & RecordModel>("docs");
  }

  /** Accepts any record-shaped object that carries `collectionId`/`collectionName` at runtime (all records returned by this client do), matching the underlying SDK's loose signature. */
  fileUrl(record: Record<string, unknown>, filename: string): string {
    return this.pb.files.getURL(record, filename);
  }

  get currentUser(): (UserRecord & RecordModel) | null {
    return this.pb.authStore.record as (UserRecord & RecordModel) | null;
  }

  get isAuthenticated(): boolean {
    return this.pb.authStore.isValid;
  }

  onAuthChange(callback: (user: (UserRecord & RecordModel) | null) => void): () => void {
    return this.pb.authStore.onChange(() => {
      callback(this.currentUser);
    }, true);
  }

  async login(email: string, password: string) {
    return this.pb.collection("users").authWithPassword(email, password);
  }

  async signup(email: string, password: string, name: string) {
    await this.pb.collection("users").create({
      email,
      // PocketBase hides the email field from other users unless this is
      // set, which would silently break the "invite by email" lookup.
      emailVisibility: true,
      password,
      passwordConfirm: password,
      name,
    });
    return this.login(email, password);
  }

  logout() {
    this.pb.authStore.clear();
  }
}

export function createAgenpicClient(url: string, authStore?: BaseAuthStore): AgenpicClient {
  return new AgenpicClient(url, authStore);
}

export type {
  CommentRecord,
  DocRecord,
  MessageRecord,
  ProjectMemberRecord,
  ProjectRecord,
  TicketRecord,
  UserRecord,
};
export { PocketBase, BaseAuthStore };
export type { RecordModel };
