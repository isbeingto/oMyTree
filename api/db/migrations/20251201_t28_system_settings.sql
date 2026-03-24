-- T28 System Settings Migration
-- Date: 2025-12-01
-- Description: Add system settings for admin language, site TDK, and favicon

-- Insert default site settings into system_config
INSERT INTO system_config (key, value, updated_at)
VALUES 
  ('admin_language', '"en"', NOW()),
  ('site_title', '"oMyTree – Turn AI Chats into Knowledge Trees"', NOW()),
  ('site_description', '"oMyTree is a visual AI interface that turns long chats into branching knowledge trees. Compare models per node, bring your own API keys, and keep your thinking structure clear."', NOW()),
  ('site_keywords', '"omytree,AI chat,knowledge tree,conversation tree,prompt engineering IDE,multi-model AI,chat visualization,BYOK,GPT,Claude,Gemini"', NOW()),
  ('site_favicon', 'null', NOW())
ON CONFLICT (key) DO NOTHING;
