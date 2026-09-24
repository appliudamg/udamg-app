import type { Role } from "./api";

// Matrice de droits — miroir de backend/core.py
export const MEDIA_WRITE_ROLES: Role[] = ["equipe_technique"];
export const MEDIA_FULL_READ_ROLES: Role[] = ["admin", "equipe_technique", "pasteur", "missionnaire", "berger"];
export const MESSAGE_SEND_ROLES: Role[] = ["admin", "equipe_technique"];
export const USER_ADMIN_ROLES: Role[] = ["admin"];
export const EVENT_MANAGE_ROLES: Role[] = ["admin", "equipe_technique", "pasteur", "missionnaire", "berger"];
export const EVENT_ADMIN_ROLES: Role[] = ["admin", "pasteur"];

const has = (list: Role[], role?: Role | null) => !!role && list.includes(role);

export const canWriteMedia = (r?: Role | null) => has(MEDIA_WRITE_ROLES, r);
export const canReadRestrictedMedia = (r?: Role | null) => has(MEDIA_FULL_READ_ROLES, r);
export const canSendMessages = (r?: Role | null) => has(MESSAGE_SEND_ROLES, r);
export const canManageUsers = (r?: Role | null) => has(USER_ADMIN_ROLES, r);
export const canManageEvents = (r?: Role | null) => has(EVENT_MANAGE_ROLES, r);
export const canAdminEvents = (r?: Role | null) => has(EVENT_ADMIN_ROLES, r);
