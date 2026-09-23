import express, { Router, type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { MAX_AVATAR_BYTES, normalizeProfileImage } from "../lib/profileImage";
import profileSettings from "./profile-settings";

const router = Router();

router.post("/avatar", requireAuth, express.raw({ type: () => true, limit: MAX_AVATAR_BYTES }), async (req, res) => {
  let image: Buffer;
  try {
    image = await normalizeProfileImage(req.body, (req.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase());
  } catch {
    return res.status(400).json({ success: false, message: "Upload a valid, non-animated JPG, PNG or WEBP image up to 5 MB (maximum 25 megapixels)." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const imageId = randomUUID();
    const avatarUrl = `/api/profile/avatars/${imageId}.webp`;
    // Lock the user row so simultaneous uploads cannot leave URL and bytes mismatched.
    const result = await client.query(
      "UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2 AND is_active=TRUE RETURNING id, full_name, email, role, team_id, avatar_url",
      [avatarUrl, req.user!.id],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(401).json({ success: false, message: "User not available" });
    }
    await client.query(
      `INSERT INTO user_profile_images (user_id,image_id,file_data) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET image_id=EXCLUDED.image_id, file_data=EXCLUDED.file_data, updated_at=NOW()`,
      [req.user!.id, imageId, image],
    );
    await client.query("COMMIT");
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Save profile image failed:", error);
    return res.status(500).json({ success: false, message: "Unable to save profile photo" });
  } finally { client.release(); }
});

// Profile images are public display assets with opaque, unguessable URLs.
// Only normalized WebP bytes are served; no names, email addresses or file paths.
router.get("/avatars/:filename", async (req, res) => {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/i.exec(String(req.params.filename));
  if (!match) return res.sendStatus(404);
  try {
    const result = await db.query("SELECT file_data FROM user_profile_images WHERE image_id=$1", [match[1]]);
    if (!result.rows[0]) return res.sendStatus(404);
    res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" });
    return res.send(result.rows[0].file_data);
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load profile photo" });
  }
});

const uploadError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({ success: false, message: "Profile images must be 5 MB or smaller." });
    return;
  }
  next(error);
};
router.use(profileSettings);
router.use(uploadError);
export default router;
