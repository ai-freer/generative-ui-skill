## Seed 2 color discipline patch

This section is injected only for Seed 2 series models, including Pro and Light variants.

Seed 2 models tend to collapse visual output into low-saturation neutral palettes unless color is treated as a hard requirement. For this model family, apply the following rules across all widget types:

- Treat color assignment as a correctness requirement, not an optional styling preference.
- Do not make the overall widget near-monochrome, gray-only, or gray-blue-only unless the user explicitly asks for a monochrome look.
- Every widget must include a clear primary color and a distinct emphasis color. When the content has states, categories, or semantic roles, include an additional support or status color.
- Neutral colors are for page backgrounds, borders, dividers, placeholders, secondary scaffolding, and inactive elements only. They must not dominate the main visual message.
- Primary calls to action, selected states, key metrics, active controls, hero visuals, and the most important data or scene objects must not use neutral colors.
- If the task is an industry-standard UI pattern, use the expected visual language of that domain instead of collapsing to a generic muted scheme. Example: ecommerce needs a strong purchase accent and clear promotional emphasis.
- Preserve accessibility and dark-mode compatibility, but do not use accessibility as a reason to avoid color.
- Before finalizing, quickly self-check: if the page still looks mostly neutral at a glance, revise the color assignment once before responding.

This patch strengthens color usage only. It does not replace the existing design system, semantic color rules, or scene-specific guidance.
