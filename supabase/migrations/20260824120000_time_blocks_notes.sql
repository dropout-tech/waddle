-- 專注計時結束後可選填「這段時間做了什麼」——內文存進時間塊的備註欄。
-- 純新增 nullable 欄位，不影響既有資料與已部署的程式。
alter table public.time_blocks add column if not exists notes text;
