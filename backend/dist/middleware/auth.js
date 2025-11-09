import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
export function requireAuth(req, res, next) {
    const auth = req.headers?.authorization;
    if (!auth?.startsWith('Bearer '))
        return res.status(401).json({ error: 'missing token' });
    const token = auth.substring(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
        next();
    }
    catch (e) {
        return res.status(401).json({ error: 'invalid token' });
    }
}
