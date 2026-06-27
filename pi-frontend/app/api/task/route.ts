export async function POST(req: Request) {
	const { input } = await req.json();
	
	try {
		const res = await fetch('http://localhost:3000/api/task', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input }),
		});
		const data = await res.json();
		return Response.json(data);
	} catch (error) {
		return Response.json({ success: false, error: 'Backend not available' }, { status: 500 });
	}
}
