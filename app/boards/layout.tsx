import BoardCardSearch from '../../components/boards/BoardCardSearch';

export default function BoardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BoardCardSearch />
    </>
  );
}
