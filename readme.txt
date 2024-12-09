install 

Запустите следующую команду в терминале:

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

После завершения установки выполните команду, чтобы настроить путь Homebrew:

echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc

brew --version

Установите системные зависимости:

brew install pkg-config cairo pango libpng jpeg giflib librsvg
