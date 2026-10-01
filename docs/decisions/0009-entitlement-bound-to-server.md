# 0009 — Right of use bound to the server, seven-day grace period

Date: 2026-09-04 · Status: amended on 2026-10-01 by [0018](./0018-source-available-and-free.md) — the right of use is called the licence (`license`, `license_required`); it is valid without payment up to three servers per organization; the token mechanism and the seven-day grace period do not change

The agent only works with a server token obtained by exchanging an enrolment token issued by the platform for a device and an account. It revalidates every 24 hours; without validation for seven days it goes into restricted mode: what is running keeps running, the app's commands no longer answer.

Why: a binary copied elsewhere has no token; the app stays usable if the platform goes down; a customer who stops paying keeps their machine intact.
