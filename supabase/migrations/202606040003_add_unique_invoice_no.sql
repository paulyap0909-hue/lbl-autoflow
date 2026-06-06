create unique index if not exists invoices_invoice_no_unique
on public.invoices (invoice_no)
where invoice_no is not null;
