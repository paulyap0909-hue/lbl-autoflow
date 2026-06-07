# LBL AutoFlow Best Practices

## Orders Workflow

Every order must follow:

New Order
→ Confirmed
→ In Kitchen
→ Ready For Collection / Delivery
→ Delivered
→ Completed

Rules:

* New Order = customer submitted order
* Confirmed = payment received
* In Kitchen = production started
* Ready = packed and waiting
* Delivered = customer received order
* Completed = archive status

---

## Kitchen Queue Standard

Kitchen Queue should only show:

* Confirmed
* In Kitchen
* Ready

Do NOT show:

* Completed
* Cancelled

Completed orders should be collapsed by default.

Staff should focus only on active production orders.

---

## Orders Dashboard Standard

Orders page should prioritize:

1. Today's Orders
2. Tomorrow Orders
3. Pending Payment
4. Kitchen Status

Avoid large horizontal tables.

Preferred layout:

* KPI Cards
* Filters
* Order Cards
* Status Badges

---

## Invoice Standard

Invoice Number Format:

LBL-YYMMDD-001

Example:

LBL-260608-001
LBL-260608-002
LBL-260608-003

Rules:

* Sequential numbering
* No random invoice number
* Generated automatically

---

## Customer CRM Standard

Customer record should contain:

* Name
* Phone
* Order History
* Total Spend
* Last Order Date

Future:

* VIP Customer
* Repeat Customer
* Corporate Customer

---

## Corporate Leads CRM Workflow

New Lead
→ Contacted
→ Interested
→ Quotation Sent
→ Won
→ Lost

Lead Priority:

Hot
Warm
Cold

---

## WhatsApp Message Standards

### Corporate Opening

Hi, this is Paul from Layer By Layer Bakery 😊

May I know who is the right person to contact regarding office tea break, staff gathering, corporate gifting or event dessert arrangements?

We prepare premium mini tarts for company events, meetings and celebrations.

---

### Order Confirmation

Must contain:

* Customer Name
* Order Number
* Product Details
* Delivery Date
* Delivery Time
* Address
* Payment Details

---

### Follow Up

Send within 3-7 days after order completion.

Ask:

* Product feedback
* Event feedback
* Future requirements

---

## Design Standards

Style:

Professional Bakery CRM

Avoid:

* Complex ERP layouts
* Too many colors
* Long horizontal tables

Prefer:

* KPI Cards
* Dashboard Layout
* Status Badges
* Mobile Responsive

---

## Reality Checker Rules

Before adding a feature:

Ask:

1. Does bakery staff need this?
2. Does it save time?
3. Does it increase sales?
4. Does it reduce mistakes?

If answer is no:

Do not build it.