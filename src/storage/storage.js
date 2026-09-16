// Supabase Storage: subida de imágenes con convención de ruta <org_id>/<...>.
// Las imágenes nuevas van a Storage; las fotos legacy (localStorage) siguen como
// fallback para no hacer desaparecer las existentes.
import { sb } from "../supabase";

const BUCKET = { LOGO: "org-logos", TRAINER: "trainer-photos", AVATAR: "avatars", ROUTINE: "routine-images", DIET: "diets" };

export function publicUrl(bucket, path) {
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Logos y foto del entrenador: buckets PÚBLICOS (branding visible pre-login).
export async function uploadLogo(orgId, file) {
  const path = `${orgId}/logo_${Date.now()}`;
  const { error } = await sb.storage.from(BUCKET.LOGO).upload(path, file, { upsert: true });
  if (error) throw error;
  return publicUrl(BUCKET.LOGO, path);
}
export async function uploadTrainerPhoto(orgId, file) {
  const path = `${orgId}/trainer_${Date.now()}`;
  const { error } = await sb.storage.from(BUCKET.TRAINER).upload(path, file, { upsert: true });
  if (error) throw error;
  return publicUrl(BUCKET.TRAINER, path);
}

// Imagen de calentamiento de una rutina: bucket PÚBLICO. Ruta <org_id>/<routine_id>/...
export async function uploadRoutineImage(orgId, routineId, file) {
  const path = `${orgId}/${routineId}/warmup_${Date.now()}`;
  const { error } = await sb.storage.from(BUCKET.ROUTINE).upload(path, file, { upsert: true });
  if (error) throw error;
  return publicUrl(BUCKET.ROUTINE, path);
}

// Avatares de clientes: bucket PRIVADO. Ruta <org_id>/<client_id>/...
export async function uploadAvatar(orgId, clientId, file) {
  const path = `${orgId}/${clientId}/avatar_${Date.now()}`;
  const { error } = await sb.storage.from(BUCKET.AVATAR).upload(path, file, { upsert: true });
  if (error) throw error;
  return path; // se lee con URL firmada (privado)
}
export async function signedAvatarUrl(path, expiresSec = 3600) {
  const { data, error } = await sb.storage.from(BUCKET.AVATAR).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

// Dietas: bucket PRIVADO. Ruta <org_id>/<client_id>/dieta_<ts>.pdf. Se lee con URL firmada.
export async function uploadDiet(orgId, clientId, file) {
  const safe = (file?.name || "dieta.pdf").replace(/[^\w.-]+/g, "_");
  const path = `${orgId}/${clientId}/dieta_${Date.now()}_${safe}`;
  const { error } = await sb.storage.from(BUCKET.DIET).upload(path, file, { upsert: true, contentType: file?.type || "application/pdf" });
  if (error) throw error;
  return path; // se guarda en users.diet_file_path
}
export async function signedDietUrl(path, expiresSec = 3600) {
  if (!path) return null;
  const { data, error } = await sb.storage.from(BUCKET.DIET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}
export async function removeDietFile(path) {
  if (!path) return;
  await sb.storage.from(BUCKET.DIET).remove([path]).catch(() => {});
}

// ── Fallback de foto de perfil ──────────────────────────────────
// Prefiere Storage (avatarUrl del cliente); si no, la foto legacy en localStorage.
export function legacyPhoto(userId) {
  try {
    return (userId && localStorage.getItem("jh_photo_" + userId)) || null;
  } catch {
    return null;
  }
}
export function resolveAvatarSrc(user) {
  if (!user) return null;
  return user.avatarUrl || legacyPhoto(user.id) || null;
}

export { BUCKET };
