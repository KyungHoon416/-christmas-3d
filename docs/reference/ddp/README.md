# DDP reference images

The DDP master prompt v1.0 came with **5 reference images** in the chat:

| # | Content | Used for |
|---|---------|----------|
| 1 | Exterior: curved metal-panel shell, glazed base, plaza | shell shape, panel texture, base band, curved planters |
| 2 | Main lobby: white curved walls, wooden stairs with LED, 2F gallery | lobby atrium, grand stairs + LED nosing, gallery parapet |
| 3 | Exhibition space: concrete barrel-vault corridor, floor LED line, purple light | exhibition corridor |
| 4 | Design store: concrete wall with large lettering, tables and shelves | design store |
| 5 | Art hall: raked red seats, stage, LED screen | art hall |
| 6 | Design loop (glass windows, snow outside) | **not provided** — modelled from the text description |

The images were attached to the conversation only; they could not be saved into this
directory from the build environment, so **no image files are stored here**. Copy the
originals into this folder (e.g. `01-exterior.jpg` … `05-arthall.jpg`) if you want them
versioned with the code. All dimensions in the model are estimates; see
`docs/DDP_MODELING_SPEC.md`.
