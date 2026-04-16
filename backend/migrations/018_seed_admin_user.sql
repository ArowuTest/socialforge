-- Migration 018: Upsert the admin@socialforge.io super-admin account.
-- Password: AdminPass123!  (bcrypt cost 10)
-- This ensures the admin portal is accessible after a fresh deploy.

DO $$
DECLARE
  v_admin_id UUID;
  v_now      TIMESTAMPTZ := NOW();
BEGIN
  SELECT id INTO v_admin_id FROM users
  WHERE email = 'admin@socialforge.io' AND deleted_at IS NULL LIMIT 1;

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO users
      (id, email, password_hash, name, full_name, plan,
       subscription_status, is_super_admin, is_suspended,
       email_verified_at, created_at, updated_at)
    VALUES
      (v_admin_id, 'admin@socialforge.io',
       '$2a$10$HZh7QiZ9mVFjWW0FIMlBAOQyCx9zZb3OpNQDDYJuFIMIuJaWzS1Pi',
       'Admin', 'ChiselPost Admin', 'agency',
       'active', TRUE, FALSE, v_now, v_now, v_now);
    RAISE NOTICE 'seed: created admin id=%', v_admin_id;
  ELSE
    -- Ensure super-admin flag is set (in case it was cleared).
    UPDATE users
    SET is_super_admin = TRUE,
        password_hash  = '$2a$10$HZh7QiZ9mVFjWW0FIMlBAOQyCx9zZb3OpNQDDYJuFIMIuJaWzS1Pi',
        updated_at     = v_now
    WHERE id = v_admin_id;
    RAISE NOTICE 'seed: updated existing admin id=%', v_admin_id;
  END IF;
END;
$$;
