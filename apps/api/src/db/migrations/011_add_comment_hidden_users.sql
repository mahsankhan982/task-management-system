CREATE TABLE IF NOT EXISTS comment_hidden_users (
  comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_hidden_users_user
  ON comment_hidden_users (user_id, comment_id);
