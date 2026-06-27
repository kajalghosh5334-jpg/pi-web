"use client";

import { useState } from "react";

export function TaskSubmitter() {
	const [loading, setLoading] = useState(false);

	const handleSubmit = async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/task', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ input: '我想做自媒体赚钱' }),
			});
			const data = await res.json();
			console.log('任务已提交:', data);
		} catch (error) {
			console.error('提交失败:', error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<button
			onClick={handleSubmit}
			disabled={loading}
			style={{
				padding: '8px 16px',
				background: loading ? '#ccc' : '#0070f3',
				color: 'white',
				border: 'none',
				borderRadius: 4,
				cursor: loading ? 'not-allowed' : 'pointer',
			}}
		>
			{loading ? '处理中...' : '测试：提交任务'}
		</button>
	);
}
