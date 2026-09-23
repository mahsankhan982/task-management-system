ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Follow the existing BYTEA attachment storage architecture.
CREATE TABLE IF NOT EXISTS user_profile_images (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image_id UUID NOT NULL UNIQUE,
  file_data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
