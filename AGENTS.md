# LBL AutoFlow AI Command Team

LBL AutoFlow is a bakery CRM system for Layer By Layer Bakery.

Use the right AI role for the task:

## Product Manager
Use when planning new features.
Focus on priority, staff workflow, and avoiding unnecessary complexity.

## UX Architect
Use when improving layout and user flow.
Focus on staff-friendly CRM, clear dashboard, fewer clicks, and mobile responsive design.

## Frontend Developer
Use when coding UI.
Focus on React components, KPI cards, status badges, order cards, and clean SaaS layout.

## Backend Architect
Use when changing database or Supabase logic.
Focus on tables, relationships, invoice sequence, order/customer sync, and data consistency.

## QA Tester
Use before deployment.
Focus on checking order creation, edit order, invoice generation, customer sync, and WhatsApp template.

## Sales CRM Strategist
Use when improving Corporate Leads.
Focus on lead scoring, follow-up status, WhatsApp outreach, corporate gifting pipeline, and event customers.

## Reality Checker
Use before big changes.
Focus on whether the feature is really needed, whether staff will understand it, and whether a simpler version should be built first.

---

# Required Context

Before starting any task, always read:

- docs/LBL_CONTEXT.md
- docs/LBL_BEST_PRACTICES.md
- docs/LBL_ROADMAP.md

These files are the source of truth for LBL AutoFlow.

Use docs/LBL_CONTEXT.md as the business truth for Layer By Layer Bakery and LBL AutoFlow.

Do not guess:

- Product price
- Product flavours
- WhatsApp wording
- CRM workflow
- Invoice rules
- Order workflow
- Corporate Leads workflow

If the task is related to UI, CRM, orders, customers, invoice, WhatsApp, Supabase, Vercel, or sales workflow, first check docs/LBL_CONTEXT.md before making changes.

---

# LBL Rules

## Core Rule

Do not randomly redesign the whole system.
Always make small, safe, production-ready changes.

## Development Rules

- Before editing, inspect existing files.
- Do not delete working features.
- Do not change Supabase schema unless requested.
- If database change is needed, provide SQL separately.
- After code change, run:
  - npm run build
  - npx tsc --noEmit
- Keep UI professional, clean, and bakery CRM focused.
- Prefer card-based CRM layout over long horizontal tables.

## System Principle

LBL AutoFlow must be simple for bakery staff.
Do not overbuild.
Every feature must help with sales, orders, kitchen, invoice, delivery, or follow-up.

## Reality Checker Questions

Before adding a feature, ask:

1. Does bakery staff need this?
2. Does it save time?
3. Does it increase sales?
4. Does it reduce mistakes?

If the answer is no, do not build it.

## Design Standards

Style:

- Professional Bakery CRM
- Dark luxury LBL theme
- Clean dashboard layout
- Mobile responsive

Avoid:

- Complex ERP layouts
- Too many colors
- Long horizontal tables
- Unnecessary redesigns

Prefer:

- KPI cards
- Filters
- Card-based CRM layouts
- Status badges
- Clear workflow actions

---

# Command Modes

Use command modes to keep work focused and safe.

## Review Mode

Use for audits, code reviews, data-risk checks, UX reviews, or architecture reviews.

Rules:

- Do not edit code unless the user asks.
- Read the required context first.
- Inspect existing files before making claims.
- Give concise findings with clear risk or priority.
- Suggest the next safest improvement.

## Build Mode

Use when the user asks to implement, fix, upgrade, or create a feature.

Rules:

- Read the required context first.
- Inspect existing files before editing.
- Keep changes scoped to the requested area.
- Preserve existing business logic unless the user explicitly asks to change it.
- Run npm run build and npx tsc --noEmit after code changes.

## Backend Mode

Use for Supabase, database mapping, service logic, invoice sequence, order sync, customer sync, and workflow consistency.

Rules:

- Do not change database schema unless requested.
- If schema change is needed, provide SQL separately.
- Protect source-of-truth data.
- Avoid duplicate invoices, duplicate kitchen tasks, duplicate delivery tasks, and stale customer totals.

## UI Mode

Use for dashboards, pages, cards, filters, modals, and staff workflows.

Rules:

- Keep the LBL black-gold premium CRM style.
- Prefer cards over wide tables.
- Make staff actions obvious.
- Avoid hiding critical actions behind confusing layouts.
- Keep mobile and small-screen views usable.

---

# Project Information

## Business

Layer By Layer Bakery is a bakery brand in Malaysia.

## Core Products

- Mini Tart
- Croissant Egg Tart

## Mini Tart

Price: RM2.50 per piece.

Main use cases:

- Office tea break
- Staff gathering
- Corporate gifting
- Event dessert
- Wedding dessert
- Private event

Signature flavours:

- Matcha Red Bean
- Chocolate Noir
- Honey Brûlée
- Lime Cheese
- Biscoff
- Black Sesame

## Main Modules

- Orders Dashboard
- Customer CRM
- Kitchen Queue
- Invoice Generator
- Corporate Leads CRM
- WhatsApp Templates
- Workflow / Status Tracking
- Supabase Database
- Vercel Deployment

## Orders Workflow

Every order must follow:

New Order
→ Confirmed
→ In Kitchen
→ Ready For Collection / Delivery
→ Delivered
→ Completed

Rules:

- New Order = customer submitted order
- Confirmed = payment received
- In Kitchen = production started
- Ready = packed and waiting
- Delivered = customer received order
- Completed = archive status

## Kitchen Queue Standard

Kitchen Queue should only show:

- Confirmed
- In Kitchen
- Ready

Do not show:

- Completed
- Cancelled

Completed orders should be collapsed by default.
Staff should focus only on active production orders.

## Orders Dashboard Standard

Orders page should prioritize:

1. Today's Orders
2. Tomorrow Orders
3. Pending Payment
4. Kitchen Status

Preferred layout:

- KPI Cards
- Filters
- Order Cards
- Status Badges

## Invoice Standard

Invoice Number Format:

LBL-YYMMDD-001

Examples:

- LBL-260608-001
- LBL-260608-002
- LBL-260608-003

Rules:

- Sequential numbering
- No random invoice number
- Generated automatically

## Customer CRM Standard

Customer record should contain:

- Name
- Phone
- Order History
- Total Spend
- Last Order Date

Future:

- VIP Customer
- Repeat Customer
- Corporate Customer

## Corporate Leads CRM Workflow

New Lead
→ Contacted
→ Interested
→ Quotation Sent
→ Won
→ Lost

Lead Priority:

- Hot
- Warm
- Cold

## WhatsApp Corporate Lead Template

Use this exact opening message:

Hi, this is Paul from Layer By Layer Bakery 😊

May I know who is the right person to contact regarding office tea break, staff gathering, corporate gifting or event dessert arrangements?

We prepare premium mini tarts for company events, meetings and celebrations.

## WhatsApp Order Confirmation Standard

Order confirmation must contain:

- Customer Name
- Order Number
- Product Details
- Delivery Date
- Delivery Time
- Address
- Payment Details

## WhatsApp Follow Up Standard

Send within 3-7 days after order completion.

Ask about:

- Product feedback
- Event feedback
- Future requirements
