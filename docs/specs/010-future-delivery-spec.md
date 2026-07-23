# 010 Future Delivery Spec

## Goal

Reserve a clean path for future Gmail MCP delivery without enabling sending in v1.

## Planned future entities

- `DeliveryAccount`
- `SendJob`
- `SendAttempt`

## Rules

- Only approved drafts can create send jobs
- Delivery providers are abstracted behind a common interface
- `manual_export` is the only implemented provider in v1

## Acceptance

- The domain model can add Gmail MCP without reworking draft or approval behavior
