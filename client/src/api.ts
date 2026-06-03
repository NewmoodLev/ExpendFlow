import { Summary, Tag, Transaction, User, AIResponse } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('expense-token');
}

export async function register(username: string, password: string) {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || 'Register failed');
  }
  return response.json();
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error('Login failed');
  }
  return response.json();
}

export async function fetchProfile(): Promise<User> {
  const token = getToken();
  const response = await fetch(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch profile');
  }
  return response.json();
}

export async function updateProfile(data: Partial<User>) {
  const token = getToken();
  const response = await fetch(`${API_URL}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('Failed to update profile');
  }
  return response.json() as Promise<User>;
}

export async function fetchTags() {
  const token = getToken();
  const response = await fetch(`${API_URL}/tags`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json() as Promise<Tag[]>;
}

export async function createTag(name: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    throw new Error('Tag creation failed');
  }
  return response.json() as Promise<Tag>;
}

export async function fetchTransactions() {
  const token = getToken();
  const response = await fetch(`${API_URL}/transactions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json() as Promise<Transaction[]>;
}

export async function createTransaction(data: {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  tag: string;
  date?: string;
}) {
  const token = getToken();
  const response = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('Transaction creation failed');
  }
  return response.json() as Promise<Transaction>;
}

export async function fetchSummary() {
  const token = getToken();
  const response = await fetch(`${API_URL}/summary`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json() as Promise<Summary>;
}

export async function fetchAISummary(question?: string): Promise<AIResponse> {
  const token = getToken();
  const response = await fetch(`${API_URL}/ai-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ question })
  });
  if (!response.ok) {
    throw new Error('AI summary failed');
  }
  return response.json();
}

export async function updateTransaction(id: string, data: Partial<Transaction>) {
  const res = await fetch(`${API_URL}/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTransaction(id: string) {
  const res = await fetch(`${API_URL}/transactions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}