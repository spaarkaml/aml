```mermaid
flowchart LR
  A[Draft] --> B{Review}
  B -->|yes| C[Compile]
  B -->|no| A
```
