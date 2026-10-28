create table if not exists public.expenses (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant text not null check (length(trim(merchant)) > 0),
  transaction_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  tax numeric(12, 2) check (tax is null or tax >= 0),
  subtotal numeric(12, 2) check (subtotal is null or subtotal >= 0),
  receipt_name text,
  receipt_type text,
  icon text not null default '🧾',
  tone text not null default 'mint',
  created_at bigint not null
);

create index if not exists expenses_user_date_idx
  on public.expenses (user_id, transaction_date desc, created_at desc);

alter table public.expenses enable row level security;

drop policy if exists "Users can read their own expenses" on public.expenses;
create policy "Users can read their own expenses"
  on public.expenses for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own expenses" on public.expenses;
create policy "Users can insert their own expenses"
  on public.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own expenses" on public.expenses;
create policy "Users can update their own expenses"
  on public.expenses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own expenses" on public.expenses;
create policy "Users can delete their own expenses"
  on public.expenses for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.expenses to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end
$$;

create table if not exists public.budgets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  unique (user_id, category)
);

alter table public.budgets enable row level security;

drop policy if exists "Users can read their own budgets" on public.budgets;
create policy "Users can read their own budgets"
  on public.budgets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own budgets" on public.budgets;
create policy "Users can insert their own budgets"
  on public.budgets for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own budgets" on public.budgets;
create policy "Users can update their own budgets"
  on public.budgets for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own budgets" on public.budgets;
create policy "Users can delete their own budgets"
  on public.budgets for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.budgets to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'budgets'
  ) then
    alter publication supabase_realtime add table public.budgets;
  end if;
end
$$;
