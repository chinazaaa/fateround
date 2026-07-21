-- Let an admin pin one post to feature it at the top of /blog.
--
-- The public page features a single post; the API keeps at most one row pinned at a time.
-- No GRANT needed — blog_posts holds table-level SELECT for anon/authenticated, which covers
-- new columns (the column-grant gotcha only applies to games/players).

alter table blog_posts add column if not exists pinned boolean not null default false;

-- Supports "pinned first, then newest" ordering.
create index if not exists idx_blog_posts_pinned on blog_posts (pinned, published_at desc);
