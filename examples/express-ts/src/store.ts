/**
 * A tiny in-memory data store so the example stays dependency-free.
 * In a real app this would be your database layer.
 */

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  createdAt: string;
}

let nextId = 1;
const users = new Map<number, User>();

function seed(name: string, email: string, role: User["role"]): void {
  const id = nextId++;
  users.set(id, {
    id,
    name,
    email,
    role,
    createdAt: new Date(Date.now() - id * 86_400_000).toISOString(),
  });
}

seed("Ada Lovelace", "ada@example.com", "admin");
seed("Alan Turing", "alan@example.com", "member");
seed("Grace Hopper", "grace@example.com", "member");

export interface ListOptions {
  q?: string;
  page: number;
  limit: number;
  offset: number;
  sortBy: "name" | "createdAt";
  order: "asc" | "desc";
  role?: "admin" | "member";
}

export const userStore = {
  list(options: ListOptions): { data: User[]; total: number } {
    let rows = [...users.values()];

    if (options.role) {
      rows = rows.filter((u) => u.role === options.role);
    }
    if (options.q) {
      const needle = options.q.toLowerCase();
      rows = rows.filter(
        (u) =>
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
      );
    }

    rows.sort((a, b) => {
      const dir = options.order === "asc" ? 1 : -1;
      return a[options.sortBy] < b[options.sortBy] ? -dir : dir;
    });

    const total = rows.length;
    const data = rows.slice(options.offset, options.offset + options.limit);
    return { data, total };
  },

  get(id: number): User | undefined {
    return users.get(id);
  },

  create(input: Pick<User, "name" | "email" | "role">): User {
    const id = nextId++;
    const user: User = { id, ...input, createdAt: new Date().toISOString() };
    users.set(id, user);
    return user;
  },

  update(
    id: number,
    input: Partial<Pick<User, "name" | "email" | "role">>,
  ): User | undefined {
    const existing = users.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...input };
    users.set(id, updated);
    return updated;
  },

  remove(id: number): boolean {
    return users.delete(id);
  },
};
