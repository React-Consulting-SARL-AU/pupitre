export interface AuthUserRecord {
  id: string
  email: string
  name: string
  emailVerified: boolean
  role: string | null
}

export interface AuthOrganizationRecord {
  id: string
  name: string
  slug: string
}

export interface AuthSessionRecord {
  id: string
  token: string
  userId: string
  expiresAt: Date
  activeOrganizationId: string | null
}

export interface AuthUserStanding {
  id: string
  email: string
  deactivatedAt?: Date | null
  deletionAt?: Date | null
}

export interface AuthPrisma {
  user: {
    findUnique(args: {
      where: { id: string }
      select: {
        id: true
        email: true
        deactivatedAt?: true
        deletionAt?: true
      }
    }): Promise<AuthUserStanding | null>
    create(args: {
      data: {
        id: string
        email: string
        name: string
        emailVerified: boolean
        role: string
      }
    }): Promise<AuthUserRecord>
  }
  session: {
    create(args: {
      data: {
        id: string
        token: string
        userId: string
        expiresAt: Date
        activeOrganizationId: string | null
      }
    }): Promise<AuthSessionRecord>
  }
  organization: {
    findUnique(args: {
      where: { slug: string }
      select: { id: true }
    }): Promise<{ id: string } | null>
    upsert(args: {
      where: { id: string }
      create: { id: string; name: string; slug: string; createdAt: Date }
      update: Record<string, never>
    }): Promise<AuthOrganizationRecord>
    create(args: {
      data: {
        id: string
        name: string
        slug: string
        createdAt: Date
        metadata: string
        members: {
          create: {
            id: string
            userId: string
            role: string
            createdAt: Date
          }
        }
      }
    }): Promise<AuthOrganizationRecord>
  }
  member: {
    findFirst(args: {
      where: { userId: string }
      orderBy: { createdAt: "asc" }
      select: { organizationId: true }
    }): Promise<{ organizationId: string } | null>
    create(args: {
      data: {
        id: string
        organizationId: string
        userId: string
        role: string
        createdAt: Date
      }
    }): Promise<{ id: string }>
    updateMany(args: {
      where: { organizationId: string; userId: string }
      data: { role: string }
    }): Promise<{ count: number }>
  }
}
