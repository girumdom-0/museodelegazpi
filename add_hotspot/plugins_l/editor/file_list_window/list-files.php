<?php

$folderPath = $_GET['folder']; // Получаем путь к папке из параметра запроса

$files = scandir($folderPath);

if ($files === false) {
  echo 'Ошибка при чтении папки';
} else {
  $files = array_diff($files, array('.', '..')); // Удаляем "." и ".." из списка файлов
  echo json_encode(array_values($files)); // Возвращаем список файлов в формате JSON
}

?>