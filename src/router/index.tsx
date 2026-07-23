import { createBrowserRouter } from 'react-router-dom'
import { routes } from './routes'

// The route table itself lives in ./routes (exported as plain data so it can be
// characterized without eagerly initializing a browser router). This module owns
// only the construction of the live router from it.
export const router = createBrowserRouter(routes)
