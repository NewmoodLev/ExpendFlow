export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  tag: string;
  date: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Summary {
  income: number;
  expense: number;
  balance: number;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface AIResponse {
  summary: string;
  insights: string[];
  recommendations: string[];
}
