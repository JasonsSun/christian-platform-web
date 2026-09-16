-- 全文索引：加速站内搜索，避免对大表做 `LIKE '%kw%'` 全表扫描。
-- 默认用 InnoDB 内置 FULLTEXT（空格/标点分词，适合中英文混排外的拉丁场景）。
-- 若 MySQL 为 8.0+ 且希望中文按字分词，可在 my.cnf 设
--   innodb_ft_min_token_size=1
--   ngram_token_size=1
-- 并手动改成 `CREATE FULLTEXT INDEX ... WITH PARSER ngram`。
-- 搜索路由会在运行时探测索引是否存在，存在则用 MATCH...AGAINST（更快+相关度排序），
-- 不存在则自动回退 LIKE，因此即使本迁移未执行也不会破坏搜索。

CREATE FULLTEXT INDEX ft_contents ON contents (title, body, tags);
CREATE FULLTEXT INDEX ft_sermons ON sermons (title, speaker, scripture, description);
CREATE FULLTEXT INDEX ft_media ON media_files (title, description, file_name);
CREATE FULLTEXT INDEX ft_prayers ON prayers (body);
