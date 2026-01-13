## React

This project uses React. For testability:

- Keep business logic in plain classes/functions outside components - testable without React Testing Library
- Components are thin wrappers that call into business logic and render results
- State management logic lives in stores/services, not useState chains
- If you can't test it with `node --test`, it's too coupled to React
