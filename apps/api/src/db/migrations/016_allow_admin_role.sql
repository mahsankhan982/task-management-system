ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Admin', 'Manager', 'Coordinator', 'Team Lead', 'Team Member'));
