function playGame(gameName) {
    const gameUrls = {
        'chess': './chess/chess.html',
        'colormem': './colormem/colormemory.html',
        'tictactoe': './tictactoe/tictactoe.html'
    };

    if (gameUrls[gameName]) {
        window.location.href = gameUrls[gameName];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.game-card');
    
    cards.forEach((card, index) => {
        card.addEventListener('mouseenter', () => {
            card.style.setProperty('--shadow-glow', getCardColor(index));
        });
    });

    function getCardColor(index) {
        const colors = [
            'rgba(139, 92, 246, 0.3)',
            'rgba(16, 185, 129, 0.3)',
            'rgba(236, 72, 153, 0.3)'
        ];
        return colors[index] || colors[0];
    }

    document.addEventListener('keydown', (e) => {
        if (e.key >= '1' && e.key <= '3') {
            const gameNames = ['chess', 'colormem', 'tictactoe'];
            playGame(gameNames[parseInt(e.key) - 1]);
        }
    });
});
