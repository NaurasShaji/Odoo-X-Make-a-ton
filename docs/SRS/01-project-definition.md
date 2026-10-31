# NexBill — Software Requirements Specification

**Document:** Project Definition and Scope  
**Version:** 0.1  
**Status:** Draft  
**Project:** Odoo Makeathon 2026

## 1. Introduction

### 1.1 Purpose

NexBill is a web-based subscription and recurring revenue management platform designed to centralize and automate the subscription lifecycle of businesses.

The platform will manage products, pricing plans, quotations, subscriptions, recurring invoices, payments, renewals and revenue analytics through a unified system.

Its primary objective is to reduce manual work in subscription operations and provide accurate, timely financial visibility.

### 1.2 Product Vision

**One platform. Every subscription. Every transaction. Fully connected.**

NexBill aims to provide a reliable and scalable subscription-management solution suitable for small and medium-sized businesses as well as larger enterprises.

### 1.3 Project Objectives

- Centralize customer and subscription information.
- Automate recurring invoice generation.
- Prevent duplicate and incorrect billing.
- Simplify payment recording and reconciliation.
- Automate subscription renewals.
- Provide timely revenue visibility.
- Identify subscriptions that require attention.
- Provide customers with a self-service portal.

## 2. Scope

### 2.1 In Scope

The initial product scope includes:

1. Authentication and role-based access control.
2. Customer management.
3. Product and variant management.
4. Subscription plan management.
5. Quotation management.
6. Subscription lifecycle management.
7. Tax and discount configuration.
8. Automated recurring billing.
9. Invoice management.
10. Payment management and reconciliation.
11. Renewal management.
12. Revenue analytics and reporting.
13. Subscription intelligence.
14. Customer self-service portal.

### 2.2 Out of Scope for the Initial Release

The initial release will not attempt to implement:

- Complete enterprise accounting or ERP functionality.
- Payroll management.
- Inventory and warehouse management.
- Tax filing and statutory compliance.
- Advanced multi-currency accounting.

These areas may be evaluated for future versions.

## 3. Target Users

NexBill will support four primary user categories.

### 3.1 Administrator

The administrator has overall control of one business workspace. A user may belong to multiple workspaces, with a separate role in each.

Responsibilities:

- Manage staff accounts.
- Configure products and plans.
- Configure taxes and discounts.
- Manage subscriptions.
- Manage invoices and payments.
- Access financial reports.
- Configure business settings.

### 3.2 Internal Staff

Internal staff handle day-to-day operations with restricted permissions.

Responsibilities:

- Manage customers.
- Prepare quotations.
- Create and manage subscriptions.
- Perform permitted invoice operations.
- View relevant customer information.

### 3.3 Finance Manager

The finance manager handles financial operations through assigned permissions.

Responsibilities:

- Monitor revenue.
- Track outstanding invoices.
- Record and reconcile payments.
- Monitor overdue invoices.
- Generate financial reports.

### 3.4 Customer

Customers can access only their own account and associated information.

Responsibilities:

- View subscriptions.
- View and download invoices.
- Track payments.
- Request subscription renewals.
- Request plan changes or pauses where permitted.

## 4. Proposed System Characteristics

- Web-based application.
- Centralized PostgreSQL database.
- Modular backend architecture.
- Background job processing for recurring operations.
- Role-based access control.
- Automated billing and renewal workflows.
- Responsive user interface.
- Customer data isolation.

## 5. Initial Success Criteria

The system should:

- Generate invoices automatically for eligible subscriptions.
- Prevent duplicate invoices for the same subscription billing period.
- Calculate applicable taxes and discounts correctly.
- Maintain accurate invoice and payment statuses.
- Identify upcoming subscription expiries.
- Provide accurate revenue summaries.
- Restrict unauthorized access to customer and financial information.
- Target dashboard response times below two seconds with thousands of subscriptions, under defined test conditions.

## 6. Open Decisions

The following decisions remain subject to confirmation in later requirements and architecture reviews:

- Deployment supports both single-business self-hosting (one workspace) and multi-tenant SaaS (multiple isolated workspaces).
- The detailed permission matrix for staff and finance users.
- Supported payment gateway providers.
- Tax jurisdictions and compliance requirements.
- Currency and localization requirements.

## 7. Tenant and Deployment Requirements

- Every business operates inside a Business/workspace boundary.
- A self-hosted deployment starts with one default workspace; tenant scoping remains enabled.
- SaaS deployments may host multiple businesses, and users may hold memberships in multiple businesses.
- Roles are assigned per membership, not globally per user.
- Customer, catalog, subscription and invoice records must be scoped to the active business.
- API authorization must verify membership server-side; client-provided business IDs and roles are never authoritative.
- Existing records are assigned to a default workspace during the multi-tenant schema migration.
