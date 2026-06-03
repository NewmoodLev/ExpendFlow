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

export interface UserData {
  transactions: Transaction[];
  tags: Tag[];
}
