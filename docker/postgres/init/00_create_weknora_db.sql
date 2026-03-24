-- Create a dedicated DB for WeKnora.
-- NOTE: This script runs once on first init of the postgres volume.

CREATE DATABASE omytree_weknora;
GRANT ALL PRIVILEGES ON DATABASE omytree_weknora TO omytree;
